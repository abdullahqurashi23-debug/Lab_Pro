import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useDragReorder } from '@/lib/useDragReorder';
import type { TestCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CategoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TestCategory[];
  onChanged: () => void;
}

export default function CategoryManagerDialog({ open, onOpenChange, categories, onChanged }: CategoryManagerDialogProps) {
  const [list, setList] = useState<TestCategory[]>([]);
  const [renaming, setRenaming] = useState<Record<number, string>>({});
  const [newName, setNewName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<TestCategory | null>(null);
  const { dragHandleProps } = useDragReorder(list, async (next) => {
    setList(next);
    try {
      await api.categories.reorder(next.map((c) => c.id));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reorder categories.');
    }
  });

  useEffect(() => {
    if (open) {
      setList(categories.slice().sort((a, b) => a.sort_order - b.sort_order));
      setRenaming({});
      setNewName('');
    }
  }, [open, categories]);

  const addCategory = async () => {
    if (!newName.trim()) return;
    try {
      await api.categories.create({ name: newName.trim(), sort_order: list.length });
      setNewName('');
      onChanged();
      toast.success('Category added.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add category.');
    }
  };

  const commitRename = async (id: number) => {
    const name = renaming[id]?.trim();
    const current = list.find((c) => c.id === id);
    if (!name || !current || name === current.name) return;
    try {
      await api.categories.update(id, { name, sort_order: current.sort_order });
      onChanged();
      toast.success('Category renamed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename category.');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.categories.delete(pendingDelete.id);
      onChanged();
      toast.success('Category deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete category.');
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {list.map((c, index) => (
            <div key={c.id} className="flex items-center gap-2">
              <button {...dragHandleProps(index)} className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing">
                <GripVertical className="h-4 w-4" />
              </button>
              <Input
                className="h-8 flex-1"
                value={renaming[c.id] ?? c.name}
                onChange={(e) => setRenaming({ ...renaming, [c.id]: e.target.value })}
                onBlur={() => commitRename(c.id)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <Button variant="ghost" size="icon" onClick={() => setPendingDelete(c)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          {list.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
        </div>
        <div className="flex gap-2 pt-2 border-t border-border">
          <Input
            placeholder="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          />
          <Button onClick={addCategory}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone. If any tests are still assigned to this category, the deletion will be refused instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
