import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Serialize batch creation/undo so "latest" is deterministic even when two
// owners upload at once. This is transaction-scoped and needs no extra service.
export async function lockRestockBatches(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(6718234)::text`;
}

export async function latestRestockBatch(prisma: PrismaService) {
  const batch = await prisma.restockBatch.findFirst({
    orderBy: { seq: 'desc' },
    select: { id: true, createdAt: true, undoneAt: true, entryCount: true, productCount: true,
      branchCount: true, totalQuantity: true, createdBy: { select: { firstName: true, lastName: true } } },
  });
  if (!batch) return null;
  const { createdBy, ...result } = batch;
  return { ...result, uploader: createdBy ? `${createdBy.firstName} ${createdBy.lastName}` : 'Unknown user' };
}

interface UndoEntry {
  id: string; productId: string; branchId: string; productName: string; branchName: string;
  quantityChange: number; quantityAfter: number; currentQuantity: number;
  archived: boolean;
}

export async function undoRestockBatch(prisma: PrismaService, batchId: string, userId: string) {
  return prisma.$transaction(async tx => {
    await lockRestockBatches(tx);
    // Do not fall back to an older batch when the latest has already been undone.
    const batch = await tx.restockBatch.findFirst({ orderBy: { seq: 'desc' } });
    if (!batch || batch.id !== batchId) throw new ConflictException('The latest restock changed. Reopen the confirmation and review it again.');
    if (batch.undoneAt) throw new ConflictException('This restock has already been undone.');

    // Lock affected inventory before checking history or writing. Concurrent
    // sales/disposals/restocks must wait; after they commit first, we see their
    // newer movement and reject the WHOLE batch, even if stock later returned
    // to the same numeric quantity.
    const entries = await tx.$queryRaw<UndoEntry[]>`
      SELECT sm.id, sm.product_id AS "productId", sm.branch_id AS "branchId",
        p.name AS "productName", b.name AS "branchName",
        sm.quantity_change AS "quantityChange", sm.quantity_after AS "quantityAfter",
        inv.quantity AS "currentQuantity",
        (p.deleted_at IS NOT NULL OR br.deleted_at IS NOT NULL OR b.deleted_at IS NOT NULL) AS archived
      FROM stock_movements sm
      JOIN inventory inv ON inv.product_id = sm.product_id AND inv.branch_id = sm.branch_id
      JOIN products p ON p.id = sm.product_id
      JOIN brands br ON br.id = p.brand_id
      JOIN branches b ON b.id = sm.branch_id
      WHERE sm.restock_batch_id = ${batchId}::uuid
      ORDER BY inv.id
      FOR UPDATE OF inv`;

    if (entries.length !== batch.entryCount) throw new ConflictException('Some restock entries are missing. Nothing was undone.');
    // A locking SELECT can wait on an inventory write after its statement
    // snapshot was taken. Re-read latest movement IDs in a NEW statement after
    // acquiring all locks so activity committed during that wait is visible.
    const latest = await tx.$queryRaw<{ productId: string; branchId: string; id: string }[]>`
      SELECT original.product_id AS "productId", original.branch_id AS "branchId", latest.id
      FROM stock_movements original
      JOIN LATERAL (
        SELECT m.id FROM stock_movements m
        WHERE m.product_id = original.product_id AND m.branch_id = original.branch_id
        ORDER BY m.seq DESC LIMIT 1
      ) latest ON TRUE
      WHERE original.restock_batch_id = ${batchId}::uuid`;
    const latestIds = new Map(latest.map(m => [`${m.productId}/${m.branchId}`, m.id]));
    const conflicts = entries.filter(e => e.archived || e.quantityChange <= 0 ||
      e.currentQuantity !== e.quantityAfter || e.currentQuantity < e.quantityChange ||
      latestIds.get(`${e.productId}/${e.branchId}`) !== e.id);
    if (conflicts.length) throw new ConflictException(`Nothing was undone. Stock changed or was archived: ${conflicts.slice(0, 10).map(e => `${e.productName} (${e.branchName})`).join(', ')}${conflicts.length > 10 ? `, and ${conflicts.length - 10} more` : ''}.`);

    const values = entries.map(e => Prisma.sql`(${e.productId}::uuid, ${e.branchId}::uuid, ${e.quantityAfter}::int, ${e.quantityChange}::int)`);
    const changed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE inventory AS inv SET quantity = inv.quantity - v.remove, updated_at = NOW()
      FROM (VALUES ${Prisma.join(values)}) AS v(pid, bid, expected, remove)
      WHERE inv.product_id = v.pid AND inv.branch_id = v.bid
        AND inv.quantity = v.expected
      RETURNING inv.id`);
    if (changed.length !== entries.length) throw new ConflictException('Stock changed while undoing. Nothing was undone; refresh and retry.');
    await tx.stockMovement.createMany({ data: entries.map(e => ({
      productId: e.productId, branchId: e.branchId, userId, type: 'ADJUSTMENT',
      quantityChange: -e.quantityChange, quantityAfter: e.quantityAfter - e.quantityChange,
      description: `Undo: reverted restock batch ${batch.id}.`,
    })) });
    await tx.restockBatch.update({ where: { id: batch.id }, data: { undoneAt: new Date(), undoneById: userId } });
    await tx.auditLog.create({ data: { userId, action: 'RESTOCK_BATCH_UNDONE', entityType: 'RestockBatch', entityId: batch.id,
      newValues: { entries: entries.length, products: batch.productCount, branches: batch.branchCount, quantity: batch.totalQuantity } } });
    return { id: batch.id, undone: entries.length };
  }, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
