'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Search, Loader2, X, Recycle, Pencil, Trash2, Plus, ShoppingCart } from 'lucide-react';
import {
  useSalesRecords,
  useSalesPending,
  useDisposals,
  useDisposalsPending,
  useExpenses,
  useProducts,
  useUpdateSale,
  useDeleteSale,
  type SaleItemInput,
} from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { Select } from '@/components/Select';
import { useToast } from '@/components/Toast';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import type { Sale, PaymentMethod, PaymentSplit } from '@/lib/types';

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function itemPaymentLabel(item: { paymentMethod: string; bankNote?: string | null; paymentSplit?: { cash: number; gcash: number } | null }) {
  if (item.paymentMethod === 'Split' && item.paymentSplit) {
    const parts: string[] = [];
    if (item.paymentSplit.cash > 0) parts.push(`₱${item.paymentSplit.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Cash`);
    if (item.paymentSplit.gcash > 0) parts.push(`₱${item.paymentSplit.gcash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Gcash`);
    return parts.join(' · ') || 'Split';
  }
  return item.paymentMethod;
}
function todayLocalDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
// A submitted item is visible on the report the instant it's saved.
// Declined items are excluded since they are permanently removed.

type ViewMode = 'sale' | 'product';

export default function StaffDailyReportPage() {
  const [view, setView] = useState<ViewMode>('sale');
  const [search, setSearch] = useState('');
  const [showDisposals, setShowDisposals] = useState(false);

  const branchName = useAuthStore((s) => s.user?.branch?.name);
  const today = useMemo(() => todayLocalDate(), []);

  const { data, isLoading, isError, error } = useSalesRecords({
    search: search || undefined,
    startDate: today,
    endDate: today,
  });
  const approvedSales = data?.data ?? [];

  const { data: pendingData } = useSalesPending({
    search: search || undefined,
    startDate: today,
    endDate: today,
  });
  const pendingSales = pendingData?.data ?? [];

  // Products for the edit modal's item dropdown (scoped to this staff's branch
  // by the backend for staff callers).
  const { data: productData } = useProducts({ limit: 200 });
  const products = productData?.data ?? [];

  const updateSale = useUpdateSale();
  const deleteSale = useDeleteSale();
  const toast = useToast();

  // Edit/Delete are only offered on the staff's OWN pending sales; the backend
  // independently enforces pending-only + own-sale, so this is safe by design.
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [deletingSale, setDeletingSale] = useState<Sale | null>(null);

  async function runSafe(fn: () => Promise<unknown>) {
    try { await fn(); } catch (e) { toast.error(getApiErrorMessage(e), 'Action failed'); }
  }

  // Today's full picture: pending + approved, sorted oldest first.
  // Tables show PENDING only; summary totals count pending + approved.
  const allSales = useMemo(
    () =>
      [...pendingSales, ...approvedSales].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [pendingSales, approvedSales],
  );

  // Tables only show PENDING sales
  const sales = useMemo(() => allSales.filter((s) => s.status === 'PENDING'), [allSales]);

  const { data: disposalsData } = useDisposals({ startDate: today, endDate: today });
  const allDisposals = (disposalsData?.data ?? []).filter((d) => d.status !== 'DECLINED');
  const todaysDisposals = allDisposals.filter((d) => d.status === 'PENDING');

  const { data: expensesData } = useExpenses({ startDate: today, endDate: today });
  const allExpenses = (expensesData?.data ?? []).filter((e) => e.status !== 'DECLINED');
  const todaysExpenses = allExpenses.filter((e) => e.status === 'PENDING');

  // Aggregate items across today's sales (pending + approved) for "View by Product".
  const productRows = useMemo(() => {
    const map = new Map<string, { name: string; brandName: string; quantity: number; total: number }>();
    for (const sale of allSales) {
      for (const item of sale.items) {
        const key = `${item.name}__${item.brandName}`;
        const cur = map.get(key) ?? { name: item.name, brandName: item.brandName, quantity: 0, total: 0 };
        cur.quantity += item.quantity;
        cur.total += item.subTotal;
        map.set(key, cur);
      }
    }
    let rows = [...map.values()];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.brandName.toLowerCase().includes(q));
    }
    return rows.sort((a, b) => b.total - a.total);
  }, [allSales, search]);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          {branchName && (
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">{branchName}</p>
          )}
          <h1 className="text-2xl font-bold text-text-primary">Daily Report</h1>
          <p className="mt-0.5 text-xs text-text-muted">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => setShowDisposals(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent-red px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
        >
          <Recycle size={16} /> Disposals
        </button>
      </div>

      <div className="mb-3 max-w-xs">
        <Select value={view} onChange={(v) => setView(v as ViewMode)} ariaLabel="View mode" className="w-full" options={[
          { value: 'sale', label: 'View by Sale' },
          { value: 'product', label: 'View by Product' },
        ]} />
      </div>

      <div className="mb-4 flex max-w-2xl items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
          />
        </div>
      </div>

      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-text-primary">
        <ShoppingCart size={16} /> Today&apos;s Sales
        {sales.length > 0 && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-text-secondary">{sales.length}</span>
        )}
      </h2>

      {isLoading ? (
        <TableSkeleton rows={5} cols={9} />
      ) : isError ? (
        <div className="py-10 text-center text-accent-red">{getApiErrorMessage(error)}</div>
      ) : sales.length === 0 ? (
        <div className="inline-block rounded-lg border border-accent-orange/40 bg-accent-orange/10 px-4 py-2 text-sm text-accent-orange">
          No sales available.
        </div>
      ) : view === 'sale' ? (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sale</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sub Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <Fragment key={sale.id}>
                  {sale.items.map((item, idx) => (
                    <tr key={item.id} className="border-t border-card-border">
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">
                        {idx === 0 && (
                          <>
                            {`#${sale.number}`}
                            {sale.customerName && (
                              <p className="text-[10px] font-normal text-accent-blue mt-0.5">{sale.customerName}</p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary">
                        {item.name}
                        {item.note && <p className="text-[10px] text-text-muted italic mt-0.5">{item.note}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{item.brandName}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{peso(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">
                        {peso(item.subTotal)}
                        {!!item.discount && <p className="text-xs font-normal text-accent-orange">−{peso(item.discount)} discount</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary max-w-[200px]">
                        <span className="break-words">{itemPaymentLabel(item)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{idx === 0 ? formatDate(sale.createdAt) : ''}</td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  ))}
                  <tr className="bg-surface-muted border-t border-card-border">
                    <td colSpan={8} className="px-4 py-2 text-sm font-semibold text-text-primary">
                      Total for Sale #{sale.number}: {peso(sale.total)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingSale(sale)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-accent-blue hover:bg-accent-blue/10 transition-colors"
                          title="Edit this sale"
                          aria-label={`Edit sale #${sale.number}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeletingSale(sale)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-accent-red hover:bg-accent-red/10 transition-colors"
                          title="Delete this sale"
                          aria-label={`Delete sale #${sale.number}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty Sold</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {productRows.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-text-muted">No products match your search.</td></tr>
              ) : (
                productRows.map((r) => (
                  <tr key={`${r.name}-${r.brandName}`} className="border-t border-card-border">
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{r.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{r.brandName}</td>
                    <td className="px-4 py-3 text-sm text-text-primary">{r.quantity}</td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{peso(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending Sales Summary — only for pending items */}
      {sales.length > 0 && (
        <div className="mt-4 rounded-xl border border-card-border bg-card-bg p-4 shadow-sm">
          <div className="border-l-4 border-accent-blue pl-4 text-right space-y-1">
            <p className="text-sm font-semibold text-text-primary">Total Sales: <span className="font-bold">{peso(sales.reduce((sum, s) => sum + s.total, 0))}</span></p>
            <p className="text-sm text-text-secondary">Total Cash: <span className="font-medium text-text-primary">{peso(sales.reduce((sum, s) => s.items.filter((i) => i.paymentMethod === 'Cash' || (i.paymentMethod === 'Split' && i.paymentSplit)).reduce((a, i) => a + (i.paymentMethod === 'Cash' ? i.subTotal : (i.paymentSplit as any)?.cash ?? 0), 0) + sum, 0))}</span></p>
            <p className="text-sm text-text-secondary">Total Gcash: <span className="font-medium text-text-primary">{peso(sales.reduce((sum, s) => s.items.filter((i) => i.paymentMethod === 'Gcash' || (i.paymentMethod === 'Split' && i.paymentSplit)).reduce((a, i) => a + (i.paymentMethod === 'Gcash' ? i.subTotal : (i.paymentSplit as any)?.gcash ?? 0), 0) + sum, 0))}</span></p>
          </div>
        </div>
      )}

      {/* Today's Disposals — PENDING only */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
        <div className="border-b border-card-border p-4">
          <h2 className="text-sm font-bold text-text-primary">Today&apos;s Disposals</h2>
        </div>
        {todaysDisposals.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No disposals today.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Value</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {todaysDisposals.map((d) => (
                <tr key={d.id} className="border-t border-card-border">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {d.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.brandName}</td>
                  <td className="px-4 py-3 text-sm text-text-primary">{d.quantity}</td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{peso(d.value)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Today's Expenses — PENDING only */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
        <div className="border-b border-card-border p-4">
          <h2 className="text-sm font-bold text-text-primary">Today&apos;s Expenses</h2>
        </div>
        {todaysExpenses.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No expenses today.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Note</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {todaysExpenses.map((e) => (
                <tr key={e.id} className="border-t border-card-border">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {peso(e.amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{e.note}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Today's Totals — always visible */}
      <div className="mt-6 rounded-xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-text-secondary mb-1">Total Sales</p>
            <p className="text-lg font-bold text-text-primary">{peso(allSales.reduce((sum, s) => sum + s.total, 0))}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-1">Total Expenses</p>
            <p className="text-lg font-bold text-accent-red">{peso(allExpenses.reduce((sum, e) => sum + e.amount, 0))}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-1">Net</p>
            <p className="text-lg font-bold text-text-primary">{peso(allSales.reduce((sum, s) => sum + s.total, 0) - allExpenses.reduce((sum, e) => sum + e.amount, 0))}</p>
          </div>
        </div>
      </div>

      {showDisposals && <PendingDisposalsModal onClose={() => setShowDisposals(false)} />}

      {editingSale && (
        <EditSaleModal
          sale={editingSale}
          products={products}
          isSaving={updateSale.isPending}
          onClose={() => setEditingSale(null)}
          onSave={async (payload) => {
            await updateSale.mutateAsync({ id: editingSale.id, ...payload });
            setEditingSale(null);
          }}
        />
      )}

      {deletingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeletingSale(null)} />
          <div className="glass relative w-full max-w-md rounded-lg p-4 sm:p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-text-primary">Delete Sale</h3>
              <button onClick={() => setDeletingSale(null)} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
            </div>
            <p className="mb-4 text-sm text-text-secondary">
              Delete pending sale <strong>#{deletingSale.number}</strong>? This cannot be undone and the stock will be returned.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingSale(null)} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:opacity-80 transition">Cancel</button>
              <button
                onClick={() => runSafe(async () => { await deleteSale.mutateAsync(deletingSale.id); setDeletingSale(null); })}
                disabled={deleteSale.isPending}
                className="px-4 py-2 bg-accent-red text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
              >
                {deleteSale.isPending ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Payment method isn't editable here (matches the admin's edit modal): editing
// quantities/discount/customer is enough for a quick fix; to change how an item
// was paid, delete the sale and re-add it. Backend re-reserves stock on save.
interface EditRow {
  productId: string;
  quantity: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  bankNote?: string | null;
  note?: string | null;
  paymentSplit?: PaymentSplit | null;
}

function EditSaleModal({
  sale,
  products,
  isSaving,
  onClose,
  onSave,
}: {
  sale: Sale;
  products: { id: string; name: string; sellingPrice: number; brand: { name: string } | null }[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: { customerName?: string; items: SaleItemInput[] }) => Promise<void>;
}) {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [customerName, setCustomerName] = useState(sale.customerName ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const guardedClose = useUnsavedGuard(dirty, onClose);

  useEffect(() => {
    setRows(
      sale.items
        .filter((i) => i.productId)
        .map((i) => ({
          productId: i.productId as string,
          quantity: i.quantity,
          discount: i.discount,
          paymentMethod: i.paymentMethod,
          bankNote: i.bankNote,
          note: i.note,
          paymentSplit: i.paymentSplit,
        })),
    );
  }, [sale]);

  const priceOf = (productId: string) => products.find((p) => p.id === productId)?.sellingPrice ?? 0;
  const computedTotal = rows.reduce((sum, r) => sum + priceOf(r.productId) * r.quantity - (r.discount ?? 0), 0);

  const setRow = (idx: number, patch: Partial<EditRow>) => {
    setDirty(true);
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    const first = products[0];
    if (!first) return;
    setDirty(true);
    setRows((rs) => [...rs, { productId: first.id, quantity: 1, paymentMethod: 'Cash' as PaymentMethod }]);
  };
  const removeRow = (idx: number) => { setDirty(true); setRows((rs) => rs.filter((_, i) => i !== idx)); };

  const handleSubmit = async () => {
    if (rows.length === 0) { setErr('A sale must have at least one item.'); return; }
    if (rows.some((r) => r.quantity < 1)) { setErr('All quantities must be at least 1.'); return; }
    setErr(null);
    try {
      await onSave({
        customerName: customerName.trim() || undefined,
        items: rows.map((r) => ({
          productId: r.productId,
          quantity: r.quantity,
          discount: r.discount ?? undefined,
          paymentMethod: r.paymentMethod,
          bankNote: r.bankNote ?? undefined,
          note: r.note ?? undefined,
          paymentSplit: r.paymentSplit ?? undefined,
        })),
      });
      setDirty(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save sale.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={guardedClose} />
      <div className="glass relative w-full max-w-lg rounded-lg p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-primary">Edit Sale #{sale.number}</h3>
          <button onClick={guardedClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        <div className="space-y-4" onInput={() => setDirty(true)}>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Customer (optional)</label>
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-text-primary">Items</label>
              <button onClick={addRow} className="flex items-center gap-1 text-sm text-accent-blue hover:underline"><Plus size={14} /> Add item</button>
            </div>
            <p className="mb-2 text-xs text-text-muted">
              Payment method isn&apos;t editable here — to change how an item was paid, delete the sale and re-add it.
            </p>
            <div className="space-y-2">
              {rows.length === 0 && <p className="text-xs text-text-muted">No items. Add at least one.</p>}
              {rows.map((row, idx) => (
                <div key={`${row.productId}-${idx}`} className="flex items-center gap-2">
                  <Select value={row.productId} onChange={(v) => setRow(idx, { productId: v })} ariaLabel="Product" className="flex-1" options={products.map((p) => ({ value: p.id, label: `${p.name}${p.brand ? ` (${p.brand.name})` : ''} — ${peso(p.sellingPrice)}` }))} />
                  <input type="number" min="1" value={row.quantity} onChange={(e) => setRow(idx, { quantity: parseInt(e.target.value) || 1 })} className="w-16 border border-input-border rounded px-2 py-1.5 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
                  <span className="w-20 text-right text-sm text-text-secondary">{peso(priceOf(row.productId) * row.quantity - (row.discount ?? 0))}</span>
                  <button onClick={() => removeRow(idx)} className="p-1.5 text-accent-red hover:bg-red-500/10 rounded transition" title="Remove"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-card-border pt-3">
            <span className="text-sm font-semibold text-text-primary">New total: {peso(computedTotal)}</span>
          </div>

          {err && <p className="text-sm text-accent-red">{err}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={guardedClose} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:opacity-80 transition">Cancel</button>
            <button onClick={handleSubmit} disabled={isSaving} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingDisposalsModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading, isError, error } = useDisposalsPending();
  const disposals = data?.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-lg border border-card-border bg-card-bg p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-primary">Pending Disposals</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        {isLoading ? (
          <div className="py-6 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading...</div>
        ) : isError ? (
          <div className="py-6 text-center text-accent-red">{getApiErrorMessage(error)}</div>
        ) : disposals.length === 0 ? (
          <div className="rounded-lg border-l-4 border-accent-blue bg-white/5 px-4 py-3 text-sm text-text-secondary">
            No pending disposals for your shop.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {disposals.map((d) => (
              <div key={d.id} className="rounded-lg border border-card-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-text-primary">{d.name}</p>
                  <span className="text-sm text-text-secondary">Qty: {d.quantity}</span>
                </div>
                <p className="text-xs text-text-muted">{d.brandName} · {peso(d.value)}{d.reason ? ` · ${d.reason}` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
