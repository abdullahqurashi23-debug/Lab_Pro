import { useState } from 'react';

/**
 * Minimal drag-to-reorder for a vertical list, built on native HTML5 drag
 * events — no extra dependency. Spread `dragHandleProps(index)` onto the
 * element that should act as the drag handle for each row.
 */
export function useDragReorder<T>(items: T[], onReorder: (next: T[]) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const dragHandleProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      if (index !== dragIndex) setOverIndex(index);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) return;
      const next = items.slice();
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      onReorder(next);
      setDragIndex(null);
      setOverIndex(null);
    },
    onDragEnd: () => {
      setDragIndex(null);
      setOverIndex(null);
    },
  });

  return { dragHandleProps, dragIndex, overIndex };
}
