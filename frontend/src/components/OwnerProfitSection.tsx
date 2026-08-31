'use client';

import { useMemo, useState } from 'react';
import { useSalesOverview, useSalesRecords, useDisposals, useExpenses, useBranches } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { Download, Store, CalendarDays, RotateCcw } from 'lucide-react';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The shop operates on a Philippine business day (UTC+8, starts 2 AM). These
// helpers give the correct YYYY-MM-DD calendar strings for the quick-pick
// ranges so they line up with the rest of the app.
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const BUSINESS_START_HOUR = 2;

/** The current PH business date as a Date on a "business clock" (2 AM = start of day). */
function phBusinessNow(): Date {
  return new Date(Date.now() + PH_OFFSET_MS - BUSINESS_START_HOUR * 60 * 60 * 1000);
}

/** Format a business-clock Date as YYYY-MM-DD (its UTC parts are the PH business date). */
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

type QuickRange = 'today' | 'week' | 'month' | 'all';

/** Returns { start, end } YYYY-MM-DD for a quick range, in PH business time. */
function quickRangeDates(range: QuickRange): { start: string; end: string } {
  if (range === 'all') return { start: '', end: '' };
  const now = phBusinessNow();
  const todayStr = ymd(now);
  if (range === 'today') return { start: todayStr, end: todayStr };
  if (range === 'week') {
    // Week starts Monday.
    const day = now.getUTCDay(); // 0=Sun..6=Sat
    const daysSinceMonday = (day + 6) % 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    return { start: ymd(monday), end: todayStr };
  }
  // month
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: ymd(first), end: todayStr };
}

/**
 * Owner-only Profit & Loss section on the dashboard.
 * Shows: Revenue - COGS - Expenses - Disposal Losses = Net Profit.
 * Only renders if user.role.name === 'Owner'.
 */
export function OwnerProfitSection() {
  const role = useAuthStore((s) => s.user?.role?.name);
  if (role !== 'Owner') return null;

  return <ProfitContent />;
}

function ProfitContent() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [branchId, setBranchId] = useState('');
  const [activeRange, setActiveRange] = useState<QuickRange | 'custom'>('all');
  const [exporting, setExporting] = useState(false);

  function applyQuickRange(range: QuickRange) {
    const { start, end } = quickRangeDates(range);
    setStartDate(start);
    setEndDate(end);
    setActiveRange(range);
  }

  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  // Fetch sales overview for date range
  const { data: salesData } = useSalesOverview('daily', branchId || undefined);
  const { data: salesRecordsData } = useSalesRecords({ branchId: branchId || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  const { data: disposalsData } = useDisposals({ branchId: branchId || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  const { data: expensesData } = useExpenses({ branchId: branchId || undefined, startDate: startDate || undefined, endDate: endDate || undefined });

  const salesRecords = Array.isArray(salesRecordsData?.data) ? salesRecordsData.data : [];
  const disposals = (Array.isArray(disposalsData?.data) ? disposalsData.data : []).filter((d) => d.status === 'APPROVED');
  const expenses = (Array.isArray(expensesData?.data) ? expensesData.data : []).filter((e) => e.status === 'APPROVED');

  // Calculate profit metrics with COGS
  const metrics = useMemo(() => {
    // Revenue from approved sales
    let revenue = 0;
    let cogs = 0;
    for (const sale of salesRecords) {
      if (sale.status !== 'APPROVED') continue;
      revenue += Number(sale.total);
      for (const item of sale.items ?? []) {
        // costPrice is snapshotted per sale item (confidential, Owner-only)
        const itemCost = Number(item.costPrice ?? 0);
        cogs += itemCost * item.quantity;
      }
    }

    // If no sales records with costPrice data, fall back to overview totals
    if (revenue === 0 && salesData) {
      const salesPoints = Array.isArray(salesData) ? salesData : [];
      for (const p of salesPoints) {
        if (startDate && p.date < startDate) continue;
        if (endDate && p.date > endDate) continue;
        revenue += p.total;
      }
    }

    const grossProfit = revenue - cogs;
    const expensesTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const disposalLosses = disposals.reduce((sum, d) => sum + Number(d.value), 0);
    const netProfit = grossProfit - expensesTotal - disposalLosses;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return { revenue, cogs, grossProfit, expensesTotal, disposalLosses, netProfit, margin };
  }, [salesRecords, salesData, expenses, disposals, startDate, endDate]);

  async function handleExportProfit() {
    setExporting(true);
    try {
      const { exportAllData } = await import('@/lib/export-all');
      await exportAllData();
    } catch {
      // silently fail
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="bg-card-bg border border-accent-primary/30 rounded-xl p-5 shadow-sm shadow-accent-primary/10">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-text-primary mb-3">Profit & Loss</h2>

        {/* Single-row filter bar: Period · From → To · Reset · Shop.
            Wraps to multiple lines on smaller screens. */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-card-border bg-white/[0.02] p-3">
          {/* Period */}
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <CalendarDays size={12} /> Period
            </label>
            <select
              value={activeRange === 'custom' ? 'custom' : activeRange}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'custom') { setActiveRange('custom'); return; }
                applyQuickRange(v as QuickRange);
              }}
              className="w-[150px] rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-input-focus"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
              {activeRange === 'custom' && <option value="custom">Custom Range</option>}
            </select>
          </div>

          {/* From */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setActiveRange('custom'); }}
              className="rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-input-focus"
            />
          </div>

          <span className="pb-2.5 text-text-muted">→</span>

          {/* To */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setActiveRange('custom'); }}
              className="rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-input-focus"
            />
          </div>

          {/* Reset (only when a custom range is set) */}
          {(startDate || endDate) && (
            <button
              onClick={() => applyQuickRange('all')}
              title="Reset the date range to All Time"
              className="flex items-center gap-2 rounded-lg border border-accent-red/40 bg-accent-red/10 px-4 py-2 text-sm font-semibold text-accent-red hover:bg-accent-red/20 transition"
            >
              <RotateCcw size={16} /> Reset
            </button>
          )}

          {/* Shop — pushed to the far right on wide screens, wraps below on small */}
          <div className="flex flex-col gap-1 sm:ml-auto">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <Store size={12} /> Shop
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full sm:w-[180px] rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-input-focus"
            >
              <option value="">All Shops</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Divider separates the filters from the results */}
      <div className="border-t border-card-border pt-4 grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
        <div>
          <p className="text-[10px] text-text-muted uppercase">Revenue</p>
          <p className="text-lg font-bold text-accent-green">{peso(metrics.revenue)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Capital</p>
          <p className="text-lg font-bold text-accent-orange">{peso(metrics.cogs)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Expenses</p>
          <p className="text-lg font-bold text-accent-red">{peso(metrics.expensesTotal)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Disposal Losses</p>
          <p className="text-lg font-bold text-accent-orange">{peso(metrics.disposalLosses)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Net Profit</p>
          <p className={`text-lg font-bold ${metrics.netProfit >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{peso(metrics.netProfit)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase">Margin</p>
          <p className={`text-lg font-bold ${metrics.margin >= 0 ? 'text-accent-blue' : 'text-accent-red'}`}>{metrics.margin.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          onClick={handleExportProfit}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-btn-primary text-btn-primary-text rounded-lg text-xs font-medium hover:opacity-90 transition disabled:opacity-60"
        >
          <Download size={13} /> {exporting ? 'Exporting...' : 'Export Profit Report'}
        </button>
      </div>
    </div>
  );
}
