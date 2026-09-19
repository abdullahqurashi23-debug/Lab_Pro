import { useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { Search } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { TestWithParameters } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TestSearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tests: TestWithParameters[];
  alreadyAddedIds: Set<number>;
  onSelect: (test: TestWithParameters) => void;
}

export default function TestSearchPalette({ open, onOpenChange, tests, alreadyAddedIds, onSelect }: TestSearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fuse = useMemo(
    () => new Fuse(tests, { keys: ['short_code', 'name'], threshold: 0.35, ignoreLocation: true }),
    [tests]
  );

  const results = useMemo(() => {
    const base = query.trim() ? fuse.search(query, { limit: 20 }).map((r) => r.item) : tests.slice(0, 20);
    return base;
  }, [query, fuse, tests]);

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${highlighted}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const pick = (test: TestWithParameters) => {
    if (alreadyAddedIds.has(test.id)) return;
    onSelect(test);
    onOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const test = results[highlighted];
      if (test) pick(test);
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden top-[20%] translate-y-0">
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 h-12 bg-transparent outline-none text-sm"
            placeholder="Search tests by name or short code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="hidden sm:inline text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-96 overflow-y-auto py-1">
          {results.length === 0 && <div className="px-4 py-6 text-sm text-muted-foreground text-center">No tests found.</div>}
          {results.map((t, index) => {
            const added = alreadyAddedIds.has(t.id);
            return (
              <button
                key={t.id}
                data-index={index}
                disabled={added}
                onClick={() => pick(t)}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-2.5 text-left text-sm',
                  index === highlighted && !added && 'bg-accent',
                  added && 'opacity-40 cursor-not-allowed'
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-medium shrink-0">{t.short_code}</span>
                  <span className="text-muted-foreground truncate">{t.name}</span>
                  {t.category_name && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
                      {t.category_name}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0 ml-2">{added ? 'Added' : `Af ${t.price}`}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
