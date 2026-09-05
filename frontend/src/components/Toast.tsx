'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Global toast system — professional title + subtitle cards with an animated
 * status icon (a "swirl → ring draws closed → mark pops" sequence).
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success('Added 1× RELX to your draft order.');
 *   toast.error('Could not save the draft.');
 *   toast.info('Heads up...');
 *
 * You can override the bold title by passing a second argument:
 *   toast.success('Order submitted!', 'All set');
 *
 * Mount <ToastProvider> once near the app root (providers.tsx). It renders a
 * fixed stack in the bottom-right and auto-dismisses each toast after ~3.6s.
 * The stack is rendered at the top level (never inside a drawer/panel), so
 * toasts can't be clipped by surrounding layout.
 */

type ToastKind = 'success' | 'error' | 'info';

const DEFAULT_TITLES: Record<ToastKind, string> = {
  success: 'Success',
  error: 'Something went wrong',
  info: 'Heads up',
};

const DURATION_MS = 3600;

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  title: string;
}

interface ToastApi {
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string, title?: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, message, title: title ?? DEFAULT_TITLES[kind] }]);
  }, []);

  const api: ToastApi = {
    success: (m, t) => push('success', m, t),
    error: (m, t) => push('error', m, t),
    info: (m, t) => push('info', m, t),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toast stack — fixed top-right, above everything, never clipped by
          layout. Top-right keeps toasts clear of the bottom-right floating
          Draft Order button on the staff pages. */}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2.5">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Animated status icon. Renders an SVG whose ring strokes itself closed and
 * whose mark (check or X) draws in, preceded by a brief spinning "swirl" arc.
 * Success = green, error/info-as-error styling handled by the caller.
 */
function AnimatedStatusIcon({ kind }: { kind: ToastKind }) {
  const color =
    kind === 'success' ? '#22c55e' : kind === 'error' ? '#ef4444' : '#3b82f6';
  const glowClass =
    kind === 'error' ? 'toast-icon-glow-error' : 'toast-icon-glow-success';
  // The mark path: a check for success/info, an X for errors.
  const markPath =
    kind === 'error' ? 'M9 9 L15 15 M15 9 L9 15' : 'M8 12.5 L11 15.5 L16.5 9.5';

  return (
    <span className={`relative inline-flex h-6 w-6 shrink-0 ${glowClass}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6 toast-icon-pop" fill="none">
        {/* Stage 1: spinning swirl arc (fades out). */}
        <circle
          className="toast-icon-swirl"
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="16 47"
          opacity="0.9"
        />
        {/* Stage 2: full ring draws itself closed. */}
        <circle
          className="toast-icon-ring"
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeWidth="2"
        />
        {/* Stage 3: mark (check or X) draws in. */}
        <path
          className="toast-icon-mark"
          d={markPath}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);

  const close = useCallback(() => {
    setExiting(true);
    // Wait for the exit animation before removing from the list.
    setTimeout(onDismiss, 220);
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(close, DURATION_MS);
    return () => clearTimeout(timer);
  }, [close]);

  const ring =
    toast.kind === 'success'
      ? 'border-accent-green/30'
      : toast.kind === 'error'
      ? 'border-accent-red/30'
      : 'border-accent-blue/30';
  const bar =
    toast.kind === 'success'
      ? 'bg-accent-green'
      : toast.kind === 'error'
      ? 'bg-accent-red'
      : 'bg-accent-blue';

  return (
    <div
      className={`pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border ${ring} bg-card-bg px-4 py-3.5 shadow-xl shadow-black/25 ${exiting ? 'toast-out' : 'toast-in'}`}
      role="status"
    >
      <span className="mt-0.5">
        <AnimatedStatusIcon kind={toast.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight text-text-primary">{toast.title}</p>
        <p className="mt-0.5 text-sm leading-snug text-text-secondary break-words">{toast.message}</p>
      </div>
      <button
        onClick={close}
        className="-mr-1 shrink-0 rounded p-0.5 text-text-muted transition hover:text-text-primary"
        aria-label="Dismiss notification"
      >
        <X size={15} />
      </button>
      {/* Auto-dismiss progress bar. */}
      <span className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-full opacity-60">
        <span
          className={`toast-progress block h-full w-full ${bar}`}
          style={{ animationDuration: `${DURATION_MS}ms` }}
        />
      </span>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe no-op fallback if used outside the provider (shouldn't happen).
    return { success: () => {}, error: () => {}, info: () => {} };
  }
  return ctx;
}
