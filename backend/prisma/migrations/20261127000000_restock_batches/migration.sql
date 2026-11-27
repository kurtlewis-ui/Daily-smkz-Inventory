CREATE TABLE "restock_batches" (
  "id" UUID NOT NULL,
  "seq" SERIAL NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" UUID,
  "entry_count" INTEGER NOT NULL,
  "product_count" INTEGER NOT NULL,
  "branch_count" INTEGER NOT NULL,
  "total_quantity" INTEGER NOT NULL,
  "undone_at" TIMESTAMP(6),
  "undone_by_id" UUID,
  CONSTRAINT "restock_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "restock_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "restock_batches_seq_key" ON "restock_batches"("seq");
ALTER TABLE "stock_movements" ADD COLUMN "restock_batch_id" UUID;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_restock_batch_id_fkey"
  FOREIGN KEY ("restock_batch_id") REFERENCES "restock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "stock_movements_restock_batch_id_idx" ON "stock_movements"("restock_batch_id");
-- Existing movement history is retained. Historical uploads have no reliable
-- batch identity; only new restocks are eligible for persistent batch undo.
