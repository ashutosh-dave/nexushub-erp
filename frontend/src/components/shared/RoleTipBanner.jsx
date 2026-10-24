import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { Button } from '../ui/Button.jsx';

const TIPS = {
  admin:
    'You run ops: start on the dashboard for SLA health, then Dispatch to assign field work. Marketplace is available for plan browsing.',
  support_lead:
    'Your job: triage tickets on Dispatch, split into sub-tasks, and assign technicians. Dashboard shows SLA risk.',
  support_agent:
    'Log clear master tickets on Dispatch (human titles help everyone). Leads assign field work and move status.',
  technician:
    'Focus on My tasks & shifts. Advance status as you work; add a short note when something matters for support.',
  buyer:
    'Browse plans and change your connection here. Ops boards are hidden — you only see what you need.',
};

export function RoleTipBanner() {
  const { user } = useAuth();
  const role = user?.role;
  const storageKey = role ? `nexushub-tip-${role}` : null;
  const [hidden, setHidden] = useState(() => {
    if (!storageKey || typeof window === 'undefined') return true;
    return window.localStorage.getItem(storageKey) === '1';
  });

  if (!role || hidden || !TIPS[role]) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
      <p className="flex-1 leading-snug">{TIPS[role]}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-sky-800"
        aria-label="Dismiss tip"
        onClick={() => {
          window.localStorage.setItem(storageKey, '1');
          setHidden(true);
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
