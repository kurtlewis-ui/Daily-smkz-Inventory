'use client';

import { useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { useLatestRestockBatch, useUndoRestockBatch, type RestockBatchSummary } from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import { Modal } from './Modal';
import { useToast } from './Toast';

export function UndoLastRestock() {
  const latest = useLatestRestockBatch();
  const undo = useUndoRestockBatch();
  const toast = useToast();
  const [review, setReview] = useState<RestockBatchSummary | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unavailable = !latest.isError && (!latest.data || !!latest.data.undoneAt);

  async function openReview() {
    setChecking(true);
    setError(null);
    try {
      const result = await latest.refetch();
      if (result.error) throw result.error;
      if (!result.data || result.data.undoneAt) {
        toast.error('No restock is available to undo.');
        return;
      }
      setReview(result.data);
    } catch (e) { toast.error(getApiErrorMessage(e)); }
    finally { setChecking(false); }
  }

  async function confirmUndo() {
    if (!review || undo.isPending) return;
    setError(null);
    try {
      const result = await undo.mutateAsync(review.id);
      setReview(null);
      toast.success(`Reverted all ${result.undone} stock entries.`, 'Restock undone');
    } catch (e) {
      const message = getApiErrorMessage(e);
      setError(message);
      toast.error(message);
      void latest.refetch();
    }
  }

  return <>
    <button type="button" onClick={openReview}
      disabled={latest.isLoading || checking || undo.isPending || unavailable}
      title={latest.isError ? 'Could not load restock status. Click to retry.' : unavailable ? 'No new restock is available to undo. Older untracked uploads are excluded.' : 'Review and undo the entire latest restock upload'}
      className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-accent-orange/40 text-accent-orange hover:bg-accent-orange/10 transition disabled:opacity-40 disabled:cursor-not-allowed">
      {checking || undo.isPending ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
      Undo Last Restock
    </button>
    {review && <Modal title="Undo last restock?" onClose={() => { if (!undo.isPending) setReview(null); }}>
      <div className="space-y-4 text-sm text-text-secondary">
        <p>This reverses the entire latest restock upload across its affected branches, regardless of the current shop filter.</p>
        <dl className="space-y-3 rounded-lg border border-card-border p-4">
          <div><dt className="text-xs text-text-muted">Uploaded by</dt><dd className="mt-1 break-words font-medium text-text-primary">{review.uploader}</dd></div>
          <div><dt className="text-xs text-text-muted">Uploaded at</dt><dd className="mt-1 text-text-primary">{new Date(review.createdAt).toLocaleString()}</dd></div>
          <div><dt className="text-xs text-text-muted">Affected stock</dt><dd className="mt-1 text-text-primary">{review.productCount} products · {review.branchCount} branches · {review.entryCount} entries</dd></div>
          <div><dt className="text-xs text-text-muted">Quantity to remove</dt><dd className="mt-1 font-semibold text-text-primary">{review.totalQuantity.toLocaleString()} units</dd></div>
        </dl>
        <p>If any affected entry has later stock activity or was archived, the whole undo is refused. Import uploads are excluded.</p>
        {error && <p role="alert" className="break-words text-accent-red">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button type="button" disabled={undo.isPending} className="btn-secondary rounded-lg px-4 py-2.5 disabled:opacity-40" onClick={() => setReview(null)}>Cancel</button>
          <button type="button" disabled={undo.isPending} className="btn-grad rounded-lg px-4 py-2.5 disabled:opacity-40" onClick={confirmUndo}>
            {undo.isPending ? 'Undoing…' : 'Confirm Undo Restock'}
          </button>
        </div>
      </div>
    </Modal>}
  </>;
}
