import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    const base = 'NexusHub ERP';
    document.title = title ? `${title} · ${base}` : base;
  }, [title]);
}
