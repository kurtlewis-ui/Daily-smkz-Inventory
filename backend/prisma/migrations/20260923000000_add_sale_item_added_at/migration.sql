-- Add a per-line "added_at" timestamp to sale_items so Sales Records can show
-- each item's ORIGINAL time (e.g. when it was staged in the draft cart) instead
-- of only the sale's single submit/created time. Nullable and additive: existing
-- rows stay NULL and fall back to the sale's created_at at display time; live
-- sales that don't supply a per-item time behave exactly as before.
ALTER TABLE "sale_items" ADD COLUMN "added_at" TIMESTAMP(6);
