import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** @param {import('axios').AxiosError} error */
export function getApiError(error) {
  const api = error.response?.data?.error;
  if (api) return api;
  return { code: 'NETWORK_ERROR', message: error.message || 'Request failed' };
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export function formatCurrency(amount) {
  const n = Number(amount);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR' }).format(n);
}

/** ISO local datetime for datetime-local input */
export function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}
