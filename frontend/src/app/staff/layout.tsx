'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { useDraftStore, type DraftItem } from '@/lib/draft';
import { useThemeStore } from '@/lib/theme';
import { useSaveDraft, useClearDraftSync, useSaveMyDraft, useMyDraftExists } from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import type { PaymentMethod, PaymentSplit } from '@/lib/types';
import {
  Home,
  ClipboardList,
  Package,
  Briefcase,
  LogOut,
  X,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Recycle,
  Receipt,
  Settings as SettingsIcon,
  Edit2,
  Moon,
  Sun,
  Menu,
  PhilippinePeso,
  XCircle,
} from 'lucide-react';

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const navItems = [
  { label: 'Home', href: '/staff', icon: <Home size={16} /> },
  { label: 'Daily Reports', href: '/staff/reports', icon: <ClipboardList size={16} /> },
  { label: 'Products', href: '/staff/products', icon: <Package size={16} /> },
];

export default function StaffLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, logout } = useAuthStore();
  const { contentTheme, toggleContentTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  const [themeAnimKey, setThemeAnimKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Auth + role guard: must be logged in and a Staff account.
  useEffect(() => {
    if (!mounted) return;
    if (!accessToken) {
      router.replace('/login');
    } else if (user && user.role?.name !== 'Staff') {
      // Admins/owners belong in the admin dashboard.
      router.replace('/dashboard');
    }
  }, [mounted, accessToken, user, router]);

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  const isActive = (href: string) =>
    href === '/staff' ? pathname === '/staff' : pathname.startsWith(href);

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page-bg">
        <p className="text-text-secondary">Loading...</p>
      </main>
    );
  }
  if (!accessToken || (user && user.role?.name !== 'Staff')) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f0f' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop always visible, mobile slides in */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col bg-nav-bg border-r border-nav-border transition-transform duration-200 md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-nav-border">
          <div className="logo-shimmer rounded-full">
            <img src="/logo.png" alt="Daily Smokz" className="h-11 w-11 rounded-full object-cover" />
          </div>
          <p className="text-base font-bold text-white">Daily Smokz</p>
        </div>

        {/* Navigation — white active state */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  active
                    ? 'bg-white/10 text-white border-l-[3px] border-white'
                    : 'text-nav-text hover:text-white hover:bg-white/5 border-l-[3px] border-transparent'
                }`}
              >
                <span className={active ? 'text-white' : 'text-[#666666]'}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-nav-border px-4 py-4">
          <div className="flex items-center gap-3 relative">
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-white/20" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white ring-1 ring-white/20">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              {user?.branch?.name && (
                <p className="text-[11px] text-[#666666] truncate">{user.branch.name}</p>
              )}
            </div>
            {/* Theme toggle */}
            <button
              onClick={() => { toggleContentTheme(); setThemeAnimKey((k) => k + 1); }}
              className="absolute top-0 right-0 p-1.5 rounded-lg text-[#999999] hover:text-white hover:bg-white/5 transition-colors"
              title={contentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              <span key={themeAnimKey} className="theme-icon-enter inline-block">
                {contentTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Link
              href="/staff/settings"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#999999] hover:text-white hover:bg-white/5 transition-colors"
              title="Settings"
            >
              <SettingsIcon size={14} />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#999999] hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-[#141414]/95 backdrop-blur-md border-b border-[#2a2a2a]">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg text-[#999999] hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Toggle navigation"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Daily Smokz" className="h-8 w-8 rounded-full object-cover" />
          <span className="text-sm font-bold text-white">Daily Smokz</span>
        </div>
        <div className="w-9" />
      </header>

      {/* Main content — applies theme */}
      <div className={`flex-1 md:ml-[220px] content-transition ${contentTheme === 'light' ? 'content-light' : ''}`}>
        <main className="px-6 py-6 pt-20 md:pt-6 max-w-[1200px] mx-auto bg-page-bg min-h-screen">{children}</main>
      </div>

      <DraftBag />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft order "bag": floating button + slide-in panel with three sections —
// items to sell, items to dispose, and expenses to log. A single "Save
// Order" submits everything together (creates the sale + disposal(s) +
// expense(s), all PENDING, awaiting admin approval).
// ---------------------------------------------------------------------------

// Payment is chosen per item (in the Add Purchase modal), not once for the
// whole order — this renders each item's choice as a small tag.
function paymentTagLabel(item: DraftItem) {
  if (item.paymentMethod === 'Split') return 'Split';
  return item.paymentMethod;
}

// Formats the split amounts as a single line, hiding zero values.
function splitBreakdownLine(split: PaymentSplit): string {
  const parts: string[] = [];
  if (split.cash > 0) parts.push(`₱${split.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Cash`);
  if (split.gcash > 0) parts.push(`₱${split.gcash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Gcash`);
  return parts.join(' · ') || '—';
}

// Formats addedAt timestamp in 12-hour format.
function formatAddedTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function DraftBag() {
  const router = useRouter();
  const { contentTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const {
    items,
    setQuantity,
    removeItem,
    updateItemPayment,
    disposalItems,
    setDisposalQuantity,
    removeDisposalItem,
    expenses,
    addExpense,
    removeExpense,
    customerName,
    setCustomerName,
    clear,
    replaceAll,
  } = useDraftStore();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingPaymentIdx, setEditingPaymentIdx] = useState<number | null>(null);
  const saveDraft = useSaveDraft();
  const clearDraftSync = useClearDraftSync();
  const saveMyDraft = useSaveMyDraft();
  const { data: myDraftExists } = useMyDraftExists();

  useEffect(() => setMounted(true), []);

  const isEmpty = items.length === 0 && disposalItems.length === 0 && expenses.length === 0;

  // Mirrors the latest poll result into a ref so the debounced timer below
  // can check it at *fire* time rather than the stale value captured when
  // the timer was scheduled.
  const myDraftExistsRef = useRef(myDraftExists);
  useEffect(() => {
    myDraftExistsRef.current = myDraftExists;
  }, [myDraftExists]);

  // Push the cart to the server (debounced) so Admins can see it live on
  // Pending Sales before it's ever submitted. Skips the initial mount so an
  // empty cart on page load doesn't fire a pointless clear.
  const didMount = useRef(false);
  const lastLocalEditAt = useRef(0);
  // Set right before a clear() that already told the server directly
  // (handleSave's saveMyDraft, handleClear's clearDraftSync, or the
  // "admin submitted my draft" cleanup below) — skips this effect's own
  // redundant follow-up sync for that change.
  const suppressNextSync = useRef(false);
  useEffect(() => {
    lastLocalEditAt.current = Date.now();
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (suppressNextSync.current) {
      suppressNextSync.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (isEmpty) {
        // Check the *freshest* known server state, not what it was when
        // this timer was scheduled. If the server currently holds content
        // we haven't reconciled down yet (e.g. a decline landed on a fresh
        // mount/rehydration before the reconcile effect got its first
        // look), don't blindly delete it out from under the staff member —
        // let the reconcile effect adopt it instead.
        const server = myDraftExistsRef.current;
        const serverHasContent =
          !!server?.exists &&
          (server.items.length > 0 || server.disposalItems.length > 0 || server.expenses.length > 0);
        if (!serverHasContent) {
          clearDraftSync.mutate();
        }
      } else {
        // Before pushing, merge any server-side items that don't exist
        // locally. This prevents a decline-restored item (added server-side
        // by restoreToDraft) from being overwritten by our full-replace push.
        // If we find missing items, adopt them locally too so the next cycle
        // doesn't push without them again.
        const server = myDraftExistsRef.current;
        let mergedItems = items;
        let mergedDisposalItems = disposalItems;
        let mergedExpenses = expenses;
        let hasNewServerContent = false;
        if (server?.exists) {
          // Append server items whose productId isn't in our local list.
          const localProductIds = new Set(items.map((i) => i.productId));
          const missingItems = (server.items ?? []).filter(
            (si: { productId: string }) => !localProductIds.has(si.productId),
          );
          if (missingItems.length > 0) {
            mergedItems = [...items, ...missingItems];
            hasNewServerContent = true;
          }
          const localDisposalIds = new Set(disposalItems.map((i) => i.productId));
          const missingDisposals = (server.disposalItems ?? []).filter(
            (si: { productId: string }) => !localDisposalIds.has(si.productId),
          );
          if (missingDisposals.length > 0) {
            mergedDisposalItems = [...disposalItems, ...missingDisposals];
            hasNewServerContent = true;
          }
          // For expenses, check by amount+note signature to avoid duplicates.
          const localExpSigs = new Set(expenses.map((e) => `${e.amount}|${e.note}`));
          const missingExpenses = (server.expenses ?? []).filter(
            (se: { amount: number; note: string }) => !localExpSigs.has(`${se.amount}|${se.note}`),
          );
          if (missingExpenses.length > 0) {
            mergedExpenses = [...expenses, ...missingExpenses];
            hasNewServerContent = true;
          }
        }
        // If decline-restored items were found, adopt them locally so the
        // store reflects the full merged state going forward.
        if (hasNewServerContent) {
          suppressNextSync.current = true;
          replaceAll(mergedItems, mergedDisposalItems, mergedExpenses);
        }
        saveDraft.mutate({
          items: mergedItems,
          disposalItems: mergedDisposalItems,
          expenses: mergedExpenses,
          customerName: customerName.trim() || undefined,
        });
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, disposalItems, expenses, customerName]);

  // If the server-side draft disappeared while we weren't actively editing
  // (nothing changed locally in the last few seconds), it wasn't us — an
  // admin must have submitted it on our behalf via "Save Draft". Clear the
  // stale local copy so we don't resubmit those same items as duplicates.
  useEffect(() => {
    if (!myDraftExists || myDraftExists.exists || isEmpty) return;
    if (Date.now() - lastLocalEditAt.current < 3000) return;
    suppressNextSync.current = true;
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDraftExists]);

  // If the server's draft content differs from what we have locally while
  // we weren't actively editing, something changed it that wasn't us — most
  // likely an admin declined an item and it was copied back in here. Adopt
  // the server's version (it can only add what we don't already know about,
  // since in the idle case our local copy should already mirror whatever we
  // last pushed). Skips the very first resolved fetch so a fresh page load
  // gets one full debounce cycle to push any not-yet-synced local edits up
  // before we start comparing — otherwise a slow first poll could clobber
  // them with whatever stale content the server still has.
  const readyToReconcile = useRef(false);
  useEffect(() => {
    if (!myDraftExists?.exists) return;
    if (!readyToReconcile.current) {
      readyToReconcile.current = true;
      return;
    }
    if (Date.now() - lastLocalEditAt.current < 3000) return;
    const serverSig = JSON.stringify([myDraftExists.items, myDraftExists.disposalItems, myDraftExists.expenses]);
    const localSig = JSON.stringify([items, disposalItems, expenses]);
    if (serverSig === localSig) return;
    replaceAll(myDraftExists.items, myDraftExists.disposalItems, myDraftExists.expenses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDraftExists]);

  const itemsTotal = useMemo(
    () => items.reduce((sum, i) => sum + i.unitPrice * i.quantity - (i.discount ?? 0), 0),
    [items],
  );
  const expensesTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses],
  );
  // Live rollup of what's staged so far, by payment method — splits an
  // item's Split-payment breakdown across its buckets. Line totals are
  // net of each item's discount.
  const paymentTotals = useMemo(() => {
    const totals = { cash: 0, gcash: 0 };
    for (const item of items) {
      const lineTotal = item.unitPrice * item.quantity - (item.discount ?? 0);
      if (item.paymentMethod === 'Split' && item.paymentSplit) {
        totals.cash += item.paymentSplit.cash;
        totals.gcash += item.paymentSplit.gcash;
      } else if (item.paymentMethod === 'Cash') totals.cash += lineTotal;
      else if (item.paymentMethod === 'Gcash') totals.gcash += lineTotal;
    }
    return totals;
  }, [items]);
  const count =
    items.reduce((sum, i) => sum + i.quantity, 0) +
    disposalItems.reduce((sum, i) => sum + i.quantity, 0) +
    expenses.length;

  async function handleSave() {
    if (isEmpty) return;
    setError(null);
    setSuccess(null);
    try {
      // Flush the very latest state to the server first — the debounced sync
      // above may not have fired yet if the staff edited and immediately hit
      // Save — then ask the server to submit whatever it has on file.
      await saveDraft.mutateAsync({
        items,
        disposalItems,
        expenses,
        customerName: customerName.trim() || undefined,
      });
      const result = await saveMyDraft.mutateAsync();
      suppressNextSync.current = true;
      clear();
      if (result.errors.length > 0) {
        // Whatever succeeded is already submitted; only the failed part (if
        // any) is still sitting in the server-side draft for a retry later —
        // stay put so the staff can see what failed instead of navigating
        // away from it.
        setError(`Some items couldn't be submitted: ${result.errors.join('; ')}`);
      } else {
        setSuccess('Order submitted! It now awaits admin approval.');
        setOpen(false);
        router.push('/staff/reports');
      }
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }

  function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    suppressNextSync.current = true;
    clear();
    clearDraftSync.mutate();
    setSuccess('Draft cleared');
    setError(null);
  }

  function handleAddExpense() {
    const amount = Number(expenseAmount);
    if (!amount || amount <= 0) {
      setError('Enter a valid expense amount.');
      return;
    }
    if (!expenseNote.trim()) {
      setError('Add a note for the expense.');
      return;
    }
    setError(null);
    addExpense({ amount, note: expenseNote.trim() });
    setExpenseAmount('');
    setExpenseNote('');
    setAddingExpense(false);
  }

  const isSaving = saveDraft.isPending || saveMyDraft.isPending;

  return (
    <>
      {/* Floating button — themed */}
      <button
        onClick={() => { setOpen((o) => !o); setSuccess(null); setError(null); }}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-black/30 hover:opacity-90 transition ${contentTheme === 'light' ? 'bg-black text-white' : 'bg-white text-black'}`}
        title="Draft order"
        aria-label="Draft order"
      >
        <Briefcase size={22} />
        {mounted && count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-red px-1.5 text-xs font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
          <div className={`fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col bg-card-bg border-l border-card-border shadow-2xl content-transition ${contentTheme === 'light' ? 'content-light' : ''}`}>
            <div className="flex items-center justify-between border-b border-card-border p-4">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Briefcase size={18} /> Draft Order
              </h3>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary transition">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* To Sell */}
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <Briefcase size={13} /> To Sell
                </h4>
                {items.length === 0 ? (
                  <div className="rounded-lg border border-card-border bg-white/5 px-4 py-3 text-center text-sm text-text-muted">
                    No items yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {items.map((item, idx) => (
                      <div key={`${item.productId}-${idx}`} className="rounded-lg border border-card-border p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-text-primary">{item.name}</p>
                            <p className="text-xs text-text-muted">{item.brandName}</p>
                          </div>
                          <span className="text-[10px] text-text-muted whitespace-nowrap ml-2">{formatAddedTime(item.addedAt)}</span>
                        </div>
                        <p className="text-xs text-text-secondary">
                          {peso(item.unitPrice)} each &middot; {peso(item.unitPrice * item.quantity - (item.discount ?? 0))} total
                        </p>
                        {!!item.discount && <p className="text-[9px] text-accent-orange">(−{peso(item.discount)} discount)</p>}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block rounded border border-input-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-text-primary">{paymentTagLabel(item)}</span>
                            <button
                              onClick={() => setEditingPaymentIdx(editingPaymentIdx === idx ? null : idx)}
                              className="text-[10px] text-accent-blue hover:underline"
                              title="Edit payment method"
                            >
                              <Edit2 size={10} />
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setQuantity(item.id, item.quantity - 1)} className="rounded p-1 text-text-secondary hover:bg-white/10" aria-label="Decrease"><Minus size={14} /></button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => setQuantity(item.id, parseInt(e.target.value) || 1)}
                              className="w-12 rounded border border-input-border bg-input-bg px-1 py-1 text-center text-sm"
                            />
                            <button onClick={() => setQuantity(item.id, item.quantity + 1)} className="rounded p-1 text-text-secondary hover:bg-white/10" aria-label="Increase"><Plus size={14} /></button>
                            <button onClick={() => removeItem(item.id)} className="rounded p-1.5 text-accent-red hover:bg-accent-red/10 ml-1" title="Remove"><Trash2 size={15} /></button>
                          </div>
                        </div>
                        {item.paymentMethod === 'Split' && item.paymentSplit && (
                          <p className="text-[10px] text-text-secondary">{splitBreakdownLine(item.paymentSplit)}</p>
                        )}
                        {editingPaymentIdx === idx && (
                          <EditPaymentInline
                            item={item}
                            onSave={(updates) => { updateItemPayment(item.id, updates); setEditingPaymentIdx(null); }}
                            onCancel={() => setEditingPaymentIdx(null)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* To Dispose */}
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <Recycle size={13} /> To Dispose
                </h4>
                {disposalItems.length === 0 ? (
                  <div className="rounded-lg border border-card-border bg-white/5 px-4 py-3 text-center text-sm text-text-muted">
                    No items staged for disposal.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {disposalItems.map((item) => (
                      <div key={item.productId} className="rounded-lg border border-card-border p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-text-primary">{item.name}</p>
                            <p className="text-xs text-text-muted">{item.brandName}</p>
                          </div>
                          {item.addedAt && (
                            <span className="text-[10px] text-text-muted whitespace-nowrap ml-2">{formatAddedTime(item.addedAt)}</span>
                          )}
                        </div>
                        {item.reason && (
                          <p className="text-xs text-accent-red">{item.reason}</p>
                        )}
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setDisposalQuantity(item.id, item.quantity - 1)} className="rounded p-1 text-text-secondary hover:bg-white/10" aria-label="Decrease"><Minus size={14} /></button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => setDisposalQuantity(item.id, parseInt(e.target.value) || 1)}
                            className="w-12 rounded border border-input-border bg-input-bg px-1 py-1 text-center text-sm"
                          />
                          <button onClick={() => setDisposalQuantity(item.id, item.quantity + 1)} className="rounded p-1 text-text-secondary hover:bg-white/10" aria-label="Increase"><Plus size={14} /></button>
                          <button onClick={() => removeDisposalItem(item.id)} className="rounded p-1.5 text-accent-red hover:bg-accent-red/10 ml-1" title="Remove"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Expenses */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <PhilippinePeso size={13} /> Expenses
                  </h4>
                  {!addingExpense && (
                    <button
                      onClick={() => setAddingExpense(true)}
                      className="flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
                    >
                      <Plus size={13} /> Add Expense
                    </button>
                  )}
                </div>

                {expenses.length === 0 && !addingExpense && (
                  <div className="rounded-lg border border-card-border bg-white/5 px-4 py-3 text-center text-sm text-text-muted">
                    No expenses logged.
                  </div>
                )}

                {expenses.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {expenses.map((exp, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-card-border p-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary">{peso(exp.amount)}</p>
                          <p className="truncate text-xs text-text-muted">{exp.note}</p>
                          {exp.addedAt && <p className="text-[10px] text-text-muted">{formatAddedTime(exp.addedAt)}</p>}
                        </div>
                        <button onClick={() => removeExpense(idx)} className="rounded p-1.5 text-accent-red hover:bg-accent-red/10" title="Remove"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {addingExpense && (
                  <div className="rounded-lg border border-card-border p-3 space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Amount (₱)</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                        placeholder="0"
                        className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Note</label>
                      <input
                        type="text"
                        value={expenseNote}
                        onChange={(e) => setExpenseNote(e.target.value)}
                        placeholder="Enter note"
                        className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setAddingExpense(false); setExpenseAmount(''); setExpenseNote(''); }}
                        className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/15 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddExpense}
                        className="flex-1 rounded-lg bg-btn-primary px-3 py-1.5 text-xs font-medium text-btn-primary-text hover:opacity-90 transition"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {success && (
                <div className="confirm-enter rounded-lg bg-btn-primary border border-card-border px-4 py-3 text-sm font-medium text-btn-primary-text flex items-center gap-2 shadow-lg">
                  <CheckCircle2 size={16} className="text-accent-green shrink-0" /> {success}
                </div>
              )}
              {error && (
                <div className="confirm-enter rounded-lg bg-btn-primary border border-card-border px-4 py-3 text-sm font-medium text-btn-primary-text flex items-center gap-2 shadow-lg">
                  <XCircle size={16} className="text-accent-red shrink-0" /> {error}
                </div>
              )}
            </div>

            {!isEmpty && (
              <div className="border-t border-card-border p-4 space-y-4">
                {/* Items Summary */}
                {items.length > 0 && (
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-text-primary text-sm">Items Summary</p>
                    {Object.entries(
                      items.reduce<Record<string, number>>((acc, i) => {
                        acc[i.name] = (acc[i.name] ?? 0) + i.quantity;
                        return acc;
                      }, {})
                    ).map(([name, qty]) => (
                      <div key={name} className="flex items-center justify-between">
                        <span className="text-text-secondary truncate">{name}</span>
                        <span className="text-text-primary font-medium">× {qty}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-card-border pt-1 mt-1">
                      <span className="text-text-secondary font-medium">Total Items</span>
                      <span className="text-text-primary font-bold">{items.reduce((s, i) => s + i.quantity, 0)}</span>
                    </div>
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  {items.length > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-text-primary">Total Sales</span>
                        <span className="font-bold text-text-primary">{peso(itemsTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Total Cash</span>
                        <span className="text-text-primary">{peso(paymentTotals.cash)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Total Gcash</span>
                        <span className="text-text-primary">{peso(paymentTotals.gcash)}</span>
                      </div>
                    </>
                  )}
                  {expenses.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Total Expenses</span>
                      <span className="font-medium text-text-primary">{peso(expensesTotal)}</span>
                    </div>
                  )}
                  {items.length > 0 && (
                    <div className="flex items-center justify-between border-t border-card-border pt-2 mt-2">
                      <span className="font-bold text-text-primary">Total Net Sales</span>
                      <span className="font-bold text-text-primary">{peso(itemsTotal - expensesTotal)}</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {confirmClear ? (
                    <>
                      <button onClick={handleClear} className="confirm-enter w-full rounded-lg bg-accent-red px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition">Yes, Clear</button>
                      <button onClick={() => setConfirmClear(false)} className="confirm-enter w-full rounded-lg border-2 border-input-border px-3 py-2.5 text-sm font-semibold text-text-primary hover:opacity-80 transition">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleClear} disabled={isSaving} className="w-full rounded-lg border-2 border-input-border px-4 py-2.5 text-sm font-semibold text-text-primary hover:opacity-80 transition disabled:opacity-60">Clear</button>
                      <button onClick={handleSave} disabled={isSaving} className="w-full bg-btn-primary text-btn-primary-text rounded-lg px-4 py-2.5 text-sm font-semibold hover:opacity-90 active:scale-[0.97] transition disabled:opacity-60">
                        {isSaving ? 'Saving...' : 'Save Order'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}


// Inline editor for changing an item's payment method without removing it.
function EditPaymentInline({
  item,
  onSave,
  onCancel,
}: {
  item: DraftItem;
  onSave: (updates: { paymentMethod: PaymentMethod; bankNote?: string | null; paymentSplit?: PaymentSplit | null }) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>(item.paymentMethod);
  const [bankNote, setBankNote] = useState(item.bankNote ?? '');
  const [splitCash, setSplitCash] = useState(String(item.paymentSplit?.cash ?? ''));
  const [splitGcash, setSplitGcash] = useState(String(item.paymentSplit?.gcash ?? ''));

  const lineTotal = item.unitPrice * item.quantity - (item.discount ?? 0);

  function peso(n: number) {
    return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function handleSave() {
    onSave({
      paymentMethod: method,
      bankNote: null,
      paymentSplit:
        method === 'Split'
          ? { cash: Number(splitCash) || 0, gcash: Number(splitGcash) || 0 }
          : null,
    });
  }

  return (
    <div className="mt-2 rounded border border-card-border bg-white/5 p-2 space-y-2">
      <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="w-full rounded border border-input-border bg-input-bg px-2 py-1 text-xs">
        <option value="Cash">Cash</option>
        <option value="Gcash">Gcash</option>
        <option value="Split">Split Payment</option>
      </select>
      {method === 'Split' && (
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="block text-[10px] text-text-muted">Cash</label>
              <input type="number" min="0" step="0.01" value={splitCash} onChange={(e) => { setSplitCash(e.target.value); setSplitGcash(Math.max(0, lineTotal - (Number(e.target.value) || 0)).toFixed(2)); }} className="w-full rounded border border-input-border bg-input-bg px-1.5 py-0.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted">Gcash</label>
              <input type="number" min="0" step="0.01" value={splitGcash} onChange={(e) => { setSplitGcash(e.target.value); setSplitCash(Math.max(0, lineTotal - (Number(e.target.value) || 0)).toFixed(2)); }} className="w-full rounded border border-input-border bg-input-bg px-1.5 py-0.5 text-xs" />
            </div>
          </div>
        </div>
      )}
      <div className="flex gap-1.5">
        <button onClick={onCancel} className="flex-1 rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-text-primary hover:bg-white/15">Cancel</button>
        <button onClick={handleSave} className="flex-1 rounded bg-btn-primary px-2 py-1 text-[10px] font-medium text-btn-primary-text hover:opacity-90">Save</button>
      </div>
    </div>
  );
}
