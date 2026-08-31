'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

/**
 * Lightweight global toast system.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success('Product saved');
 *   toast.error('Could not save');
 *   toast.info('Heads up...');
 *
 * Mount <ToastProvider> once near the app root (providers.tsx). It renders a
 * fixed stack in the bottom-right and auto-dismisses each toast after ~3.2s.
 */

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, message }]);
  }, []);

  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toast stack — fixed, above everything */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);

  const close = useCallback(() => {
    setExiting(true);
    // Wait for the exit animation before removing from the list.
    setTimeout(onDismiss, 200);
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(close, 3200);
    return () => clearTimeout(timer);
  }, [close]);

  const styles: Record<ToastKind, { icon: ReactNode; ring: string; bar: string }> = {
    success: {
      icon: <CheckCircle2 size={18} className="text-accent-green" />,
      ring: 'border-accent-green/30',
      bar: 'bg-accent-green',
    },
    error: {
      icon: <XCircle size={18} className="text-accent-red" />,
      ring: 'border-accent-red/30',
      bar: 'bg-accent-red',
    },
    info: {
      icon: <Info size={18} className="text-accent-blue" />,
      ring: 'border-accent-blue/30',
      bar: 'bg-accent-blue',
    },
  };
  const s = styles[toast.kind];

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 overflow-hidden rounded-lg border ${s.ring} bg-card-bg px-3.5 py-3 shadow-lg shadow-black/20 ${exiting ? 'toast-out' : 'toast-in'}`}
      role="status"
    >
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <p className="flex-1 text-sm text-text-primary">{toast.message}</p>
      <button
        onClick={close}
        className="shrink-0 text-text-muted hover:text-text-primary transition"
        aria-label="Dismiss notification"
      >
        <X size={15} />
      </button>
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
