import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { Button } from './Button.jsx';

export function Sheet({ open, onOpenChange, side = 'left', children, title }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const sideClass =
    side === 'right'
      ? 'right-0 left-auto border-l w-[min(100%,24rem)]'
      : side === 'left'
        ? 'left-0 w-[min(100%,20rem)] border-r'
        : 'bottom-0 left-0 right-0 border-t max-h-[85vh]';

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Close panel"
        onClick={() => onOpenChange?.(false)}
      />
      <div
        className={cn(
          'absolute flex h-full flex-col border-slate-200 bg-white shadow-xl',
          sideClass
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="font-semibold text-slate-900">{title}</span>
          <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange?.(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
