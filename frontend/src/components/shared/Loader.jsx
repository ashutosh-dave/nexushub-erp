import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export function Loader({ className, label = 'Loading…' }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-12 text-slate-500', className)}>
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}
