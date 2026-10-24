import { describe, expect, it } from 'vitest';
import {
  findOverlappingTasks,
  windowContainedInShift,
  windowsOverlap,
} from '../src/utils/overlap.js';

describe('windowsOverlap', () => {
  it('detects overlapping intervals', () => {
    expect(
      windowsOverlap(
        { start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' },
        { start: '2026-01-01T10:30:00Z', end: '2026-01-01T12:00:00Z' }
      )
    ).toBe(true);
  });

  it('allows touching boundaries', () => {
    expect(
      windowsOverlap(
        { start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' },
        { start: '2026-01-01T11:00:00Z', end: '2026-01-01T12:00:00Z' }
      )
    ).toBe(false);
  });
});

describe('findOverlappingTasks', () => {
  const tasks = [
    {
      id: 1,
      status: 'Open',
      window_start: '2026-01-01T10:00:00Z',
      window_end: '2026-01-01T11:00:00Z',
      ticket_no: 'TK-000001',
    },
    {
      id: 2,
      status: 'Resolved',
      window_start: '2026-01-01T10:30:00Z',
      window_end: '2026-01-01T11:30:00Z',
      ticket_no: 'TK-000002',
    },
  ];

  it('excludes self and resolved tasks', () => {
    const conflicts = findOverlappingTasks(
      tasks,
      { start: '2026-01-01T10:30:00Z', end: '2026-01-01T10:45:00Z' },
      1
    );
    expect(conflicts).toHaveLength(0);
  });

  it('finds overlap on other active tasks', () => {
    const conflicts = findOverlappingTasks(
      tasks,
      { start: '2026-01-01T10:30:00Z', end: '2026-01-01T10:45:00Z' },
      99
    );
    expect(conflicts.map((c) => c.id)).toEqual([1]);
  });
});

describe('windowContainedInShift', () => {
  it('accepts window inside shift on same date', () => {
    const ok = windowContainedInShift('2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', {
      shift_date: '2026-01-01',
      start_time: '09:00:00',
      end_time: '17:00:00',
    });
    expect(ok).toBe(true);
  });

  it('rejects window outside shift hours', () => {
    const ok = windowContainedInShift('2026-01-01T07:00:00Z', '2026-01-01T08:00:00Z', {
      shift_date: '2026-01-01',
      start_time: '09:00:00',
      end_time: '17:00:00',
    });
    expect(ok).toBe(false);
  });
});
