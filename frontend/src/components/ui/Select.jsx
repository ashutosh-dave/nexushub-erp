import { cn } from '../../lib/utils.js';

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
