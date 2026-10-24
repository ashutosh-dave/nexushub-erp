import { Inbox } from 'lucide-react';

export function EmptyState({ title = 'No data', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-500">
      <Inbox className="h-10 w-10 opacity-50" aria-hidden />
      <p className="font-medium text-slate-700">{title}</p>
      {description ? <p className="max-w-sm text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
