import { createContext, useContext, useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { Button } from './Button.jsx';

const DialogCtx = createContext(null);

export function Dialog({ open, onOpenChange, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <DialogCtx.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/40"
          aria-label="Close dialog"
          onClick={() => onOpenChange?.(false)}
        />
        {children}
      </div>
    </DialogCtx.Provider>
  );
}

export function DialogContent({ className, children, title, description }) {
  const ctx = useContext(DialogCtx);
  const titleId = useId();
  const descId = useId();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      className={cn(
        'relative z-10 w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-lg',
        className
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {title ? (
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p id={descId} className="mt-1 text-sm text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={() => ctx?.onOpenChange?.(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {children}
    </div>
  );
}

export function DialogFooter({ className, ...props }) {
  return <div className={cn('mt-6 flex flex-wrap justify-end gap-2', className)} {...props} />;
}
