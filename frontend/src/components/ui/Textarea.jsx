import { cn } from '../../lib/utils.js';

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
