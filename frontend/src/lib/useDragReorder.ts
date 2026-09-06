'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Lightweight pointer-based list reordering (works with both mouse and touch,
 * no external dependency). You render a drag handle on each row and wire its
 * `onPointerDown` to `startDrag(index, event)`. While dragging, the hook tracks
 * which row the pointer is over and live-reorders a working copy of the list;
 * on release it calls `onCommit` with the final ordered array.
 *
 * Usage:
 *   const { items, dragIndex, overIndex, startDrag } = useDragReorder(products, {
 *     getId: (p) => p.id,
 *     onCommit: (ordered) => reorder.mutate(ordered.map((p) => p.id)),
 *   });
 *   items.map((p, i) => (
 *     <Row
 *       key={p.id}
 *       onPointerDown={(e) => startDrag(i, e)}  // on the handle only
 *       dragging={dragIndex === i}
 *       dropTarget={overIndex === i}
 *     />
 *   ));
 *
 * The hook keeps its own copy of the list (`items`) so the UI updates smoothly
 * mid-drag. When `source` changes (e.g. a refetch) and no drag is active, the
 * copy re-syncs via `syncFromSource`.
 */
export interface DragReorderOptions<T> {
  getId: (item: T) => string;
  onCommit: (orderedIds: string[], ordered: T[]) => void;
}

export function useDragReorder<T>(source: T[], options: DragReorderOptions<T>) {
  const { getId, onCommit } = options;

  const [items, setItems] = useState<T[]>(source);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Refs so the pointer handlers (attached to window) always see fresh values.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const draggingRef = useRef(false);
  const rowRectsRef = useRef<{ id: string; top: number; bottom: number }[]>([]);

  // Re-sync the working copy from the latest server data when we're not mid-drag
  // and the set of IDs actually changed (order or membership). Compares by id so
  // a same-order refetch doesn't clobber anything.
  const syncFromSource = useCallback(() => {
    if (draggingRef.current) return;
    const a = itemsRef.current.map(getId).join('|');
    const b = source.map(getId).join('|');
    if (a !== b) setItems(source);
  }, [source, getId]);

  const endDrag = useCallback(() => {
    draggingRef.current = false;
    const finalItems = itemsRef.current;
    setDragIndex(null);
    setOverIndex(null);
    window.removeEventListener('pointermove', handleMoveRef.current!);
    window.removeEventListener('pointerup', handleUpRef.current!);
    window.removeEventListener('pointercancel', handleUpRef.current!);
    document.body.style.userSelect = '';
    onCommit(finalItems.map(getId), finalItems);
  }, [getId, onCommit]);

  // Stable refs to the live listeners so we can remove them on release.
  const handleMoveRef = useRef<((e: PointerEvent) => void) | null>(null);
  const handleUpRef = useRef<(() => void) | null>(null);

  const startDrag = useCallback(
    (index: number, e: { clientY: number; preventDefault: () => void }) => {
      e.preventDefault();
      draggingRef.current = true;
      setDragIndex(index);
      setOverIndex(index);
      document.body.style.userSelect = 'none';

      // Snapshot the vertical midpoints of every rendered row so we can figure
      // out which slot the pointer is hovering as it moves.
      const nodes = document.querySelectorAll<HTMLElement>('[data-reorder-row]');
      rowRectsRef.current = Array.from(nodes).map((n) => {
        const r = n.getBoundingClientRect();
        return { id: n.dataset.reorderId ?? '', top: r.top, bottom: r.bottom };
      });

      const handleMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const y = ev.clientY;
        const rects = rowRectsRef.current;
        const current = itemsRef.current;
        // Find the row whose vertical span contains the pointer.
        let target = -1;
        for (let i = 0; i < rects.length; i++) {
          if (y >= rects[i].top && y <= rects[i].bottom) { target = i; break; }
        }
        if (target === -1) {
          // Above the first row or below the last — clamp.
          if (rects.length && y < rects[0].top) target = 0;
          else if (rects.length && y > rects[rects.length - 1].bottom) target = rects.length - 1;
        }
        if (target === -1) return;
        void current;

        setOverIndex(target);

        // Move the dragged item to the hovered slot in the working copy.
        setDragIndex((prevDrag) => {
          if (prevDrag == null || prevDrag === target) return prevDrag;
          const next = [...itemsRef.current];
          const [moved] = next.splice(prevDrag, 1);
          next.splice(target, 0, moved);
          setItems(next);
          // Recompute rects after the DOM reflows on the next frame.
          requestAnimationFrame(() => {
            const nodes2 = document.querySelectorAll<HTMLElement>('[data-reorder-row]');
            rowRectsRef.current = Array.from(nodes2).map((n) => {
              const r = n.getBoundingClientRect();
              return { id: n.dataset.reorderId ?? '', top: r.top, bottom: r.bottom };
            });
          });
          return target;
        });
      };

      const handleUp = () => endDrag();

      handleMoveRef.current = handleMove;
      handleUpRef.current = handleUp;
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
    },
    [endDrag],
  );

  return { items, setItems, dragIndex, overIndex, startDrag, syncFromSource };
}
