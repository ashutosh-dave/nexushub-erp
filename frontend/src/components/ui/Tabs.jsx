import { createContext, useContext, useState } from 'react';
import { cn } from '../../lib/utils.js';

const TabsCtx = createContext(null);

export function Tabs({ defaultValue, value: controlled, onValueChange, children, className }) {
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled ?? internal;
  const setValue = (v) => {
    setInternal(v);
    onValueChange?.(v);
  };
  return (
    <TabsCtx.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({ className, ...props }) {
  return (
    <div
      className={cn(
        'inline-flex h-9 items-center rounded-lg bg-slate-100 p-1 text-slate-600',
        className
      )}
      role="tablist"
      {...props}
    />
  );
}

export function TabsTrigger({ value, className, children, ...props }) {
  const ctx = useContext(TabsCtx);
  const active = ctx?.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium transition-colors',
        active ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900',
        className
      )}
      onClick={() => ctx?.setValue(value)}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children, ...props }) {
  const ctx = useContext(TabsCtx);
  if (ctx?.value !== value) return null;
  return (
    <div role="tabpanel" className={cn('mt-4', className)} {...props}>
      {children}
    </div>
  );
}
