# Undo Last Restock

Owner and Admin can review and confirm the latest tracked restock from Products. The button sits after Reset Stock (Owner) or Reorder (Admin). It reverses the entire upload across branches regardless of the current shop filter. Imports are separate and are not undone by this action.

Apply the additive `20261127000000_restock_batches` migration before serving the updated backend. It adds batch metadata and a nullable movement reference; existing quantities, products, users, and history are preserved. Older restocks remain untracked and are not offered as the latest batch. The button is initially unavailable until a new restock is submitted after deployment.

Restock batches and quantities are committed together. Undo locks affected inventory, requires the original restock to still be the newest movement for every pair, checks quantities and archived records, and rolls back the whole operation on conflict. Compensating stock movements and audit records preserve history. Repeated or stale confirmation cannot undo twice or target an older batch. The original movement-level undo rejects tracked batch entries.

The status query returns only uploader, timestamp and counts; no costs are returned. It uses no polling interval and rechecks when opening confirmation. Database regression tests use disposable in-memory PostgreSQL-compatible PGlite, with no production database access.
