import { forwardRef } from 'react';
import { cn } from '../../lib/utils.js';

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});
