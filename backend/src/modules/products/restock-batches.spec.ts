import { latestRestockBatch, undoRestockBatch } from './restock-batches';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

function fixture() {
  const batch = { id: 'batch', entryCount: 2, productCount: 2, branchCount: 1, totalQuantity: 12, undoneAt: null };
  const entries = [
    { id: 'm1', productId: 'p1', branchId: 'b1', productName: 'Device', branchName: 'Main', quantityChange: 5, quantityAfter: 15, currentQuantity: 15, archived: false },
    { id: 'm2', productId: 'p2', branchId: 'b1', productName: 'Battery', branchName: 'Main', quantityChange: 7, quantityAfter: 9, currentQuantity: 9, archived: false },
  ];
  const tx = {
    restockBatch: { findFirst: jest.fn().mockResolvedValue(batch), update: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValueOnce([]).mockImplementationOnce(async () => entries)
      .mockImplementation(async () => entries.map(e => ({ productId: e.productId, branchId: e.branchId, id: e.id }))),
    inventory: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    stockMovement: { createMany: jest.fn() }, auditLog: { create: jest.fn() },
  };
  const prisma = { ...tx, $transaction: jest.fn(async (fn: any) => fn(tx)) };
  return { prisma, tx, entries, batch };
}

describe('Persistent restock batch undo', () => {
  it.each(['latestRestock', 'undoRestock'])('%s permits Owner/Admin and excludes Staff', method => {
    expect(Reflect.getMetadata(ROLES_KEY, (ProductsController.prototype as any)[method])).toEqual(['Owner', 'Admin']);
    expect(Reflect.getMetadata(ROLES_KEY, ProductsController.prototype.restock)).toEqual(['Owner', 'Admin']);
  });
  it('refuses per-movement undo for tracked restocks so a batch cannot be partially reversed', async () => {
    const prisma = { stockMovement: { findUnique: jest.fn().mockResolvedValue({ id: 'movement', type: 'RESTOCK', restockBatchId: 'batch' }) }, $transaction: jest.fn() };
    const service = new ProductsService(prisma as any, {} as any);
    await expect(service.undoStockMovements(['movement'], 'owner')).rejects.toThrow('Undo Last Restock');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('returns only count/date/uploader metadata, no inventory or financial details', async () => {
    const { prisma, tx } = fixture();
    tx.restockBatch.findFirst.mockResolvedValue({ id: 'batch', entryCount: 2, createdAt: new Date(), undoneAt: null,
      productCount: 2, branchCount: 1, totalQuantity: 12, createdBy: { firstName: 'Uploader', lastName: 'Owner' } });
    const result = await latestRestockBatch(prisma as any);
    expect(result).toMatchObject({ uploader: 'Uploader Owner', totalQuantity: 12 });
    expect(Object.keys(result!).sort()).toEqual(['branchCount', 'createdAt', 'entryCount', 'id', 'productCount', 'totalQuantity', 'undoneAt', 'uploader'].sort());
  });
  it('undoes every entry and writes compensating history, batch status and audit together', async () => {
    const { prisma, tx } = fixture();
    expect(await undoRestockBatch(prisma as any, 'batch', 'admin')).toEqual({ id: 'batch', undone: 2 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(tx.inventory.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ productId: 'p1', quantityChange: -5, quantityAfter: 10 }),
      expect.objectContaining({ productId: 'p2', quantityChange: -7, quantityAfter: 2 }),
    ]);
    expect(tx.restockBatch.update).toHaveBeenCalledWith({ where: { id: 'batch' }, data: { undoneAt: expect.any(Date), undoneById: 'admin' } });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it.each(['newer-activity', 'changed-count', 'archived', 'missing-entry', 'already-undone', 'stale-confirmation'])(
    'refuses the entire batch before writing: %s', async reason => {
      const { prisma, tx, entries, batch } = fixture();
      if (reason === 'newer-activity') tx.$queryRaw.mockReset()
        .mockResolvedValueOnce([]).mockResolvedValueOnce(entries).mockResolvedValueOnce([{ productId: 'p1', branchId: 'b1', id: 'sale' }]);
      if (reason === 'changed-count') entries[1].currentQuantity = 8;
      if (reason === 'archived') entries[1].archived = true;
      if (reason === 'missing-entry') entries.pop();
      if (reason === 'already-undone') (batch as any).undoneAt = new Date();
      if (reason === 'stale-confirmation') batch.id = 'newer-batch';
      await expect(undoRestockBatch(prisma as any, 'batch', 'owner')).rejects.toThrow();
      expect(tx.inventory.updateMany).not.toHaveBeenCalled();
      expect(tx.stockMovement.createMany).not.toHaveBeenCalled();
      expect(tx.restockBatch.update).not.toHaveBeenCalled();
    },
  );
});
