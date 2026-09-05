'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Custom accessible dropdown to replace native <select>, so the OPEN option
 * list can be styled (roomy padding, hover, checkmark) — the native list is
 * drawn by the browser and can't be. Keep the trigger and list mostly SOLID
 * (only a whisper of polish) so data stays crisp; the list is a floating
 * overlay so it may carry a light glass tint (it's chrome, not data).
 *
 * Drop-in for the common `<select value onChange>` pattern:
 *   <Select
 *     value={shopFilter}
 *     onChange={setShopFilter}
 *     options={[{ value: '', label: 'All Shops' }, ...branches.map(b => ({ value: b.id, label: b.name }))]}
 *     className="min-w-[180px]"
 *   />
 *
 * Notes:
 * - `onChange` receives the selected value string (not an event), matching how
 *   most call sites used `e.target.value`.
 * - The listbox is rendered in a portal and positioned under the trigger, so
 *   it's never clipped by overflow/transform ancestors (tables, modals).
 * - Keyboard: Enter/Space/Down opens; Up/Down move; Enter selects; Esc closes.
 */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = '',
  disabled = false,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; bottom: number } | null>(null);
  const listboxId = useId();

  useEffect(() => setMounted(true), []);

  const selected = options.find((o) => o.value === value);

  const updateRect = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, width: r.width, bottom: r.bottom });
  }, []);

  // Position the list on open and keep it in sync while scrolling/resizing.
  useLayoutEffect(() => {
    if (!open) return;
    updateRect();
    const onScroll = () => updateRect();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updateRect]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // When opening, focus the current (or first) option.
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  function commit(idx: number) {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        commit(activeIndex);
      }
    }
  }

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={`glass-select flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-primary focus:outline-none disabled:opacity-60 ${className}`}
      >
        <span className={`truncate ${selected ? '' : 'text-text-muted'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {mounted && open && rect &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            id={listboxId}
            className="glass fixed z-[70] max-h-72 overflow-y-auto rounded-xl p-1.5 shadow-xl shadow-black/30"
            style={{
              left: rect.left,
              top: rect.bottom + 6,
              width: rect.width,
              minWidth: rect.width,
            }}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isActive = idx === activeIndex;
              return (
                <li key={opt.value || `opt-${idx}`} data-idx={idx} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => commit(idx)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                      isActive ? 'bg-white/5' : ''
                    } ${isSelected ? 'text-text-primary font-medium' : 'text-text-secondary'}`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check size={15} className="shrink-0 text-accent-green" />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
