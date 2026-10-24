import { describe, expect, it } from 'vitest';
import { computeProration, roundHalfUp2 } from '../src/utils/proration.js';

describe('roundHalfUp2', () => {
  it('rounds half up at 2 decimals', () => {
    expect(roundHalfUp2(2.675)).toBe(2.68);
    expect(roundHalfUp2(2.674)).toBe(2.67);
    expect(roundHalfUp2(0)).toBe(0);
  });
});

describe('computeProration', () => {
  it('computes upgrade mid-cycle for 30-day month', () => {
    const r = computeProration('2026-03-01', '2026-03-11', 100, 200);
    expect(r.daysInCycle).toBe(31);
    expect(r.daysRemaining).toBe(21);
    expect(r.oldCredit).toBe(-67.74);
    expect(r.newCharge).toBe(135.48);
    expect(r.net).toBe(67.74);
  });

  it('computes downgrade', () => {
    const r = computeProration('2026-03-01', '2026-03-11', 200, 100);
    expect(r.net).toBeLessThan(0);
  });

  it('handles February leap year cycle length', () => {
    const r = computeProration('2024-02-01', '2024-02-15', 100, 150);
    expect(r.daysInCycle).toBe(29);
    expect(r.daysRemaining).toBe(15);
  });

  it('handles effective date on last day of cycle', () => {
    const r = computeProration('2026-04-01', '2026-04-30', 90, 120);
    expect(r.daysInCycle).toBe(30);
    expect(r.daysRemaining).toBe(1);
    expect(r.daysUsed).toBe(29);
  });
});
