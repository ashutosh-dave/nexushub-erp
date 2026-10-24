/**
 * Round half up to 2 decimals using integer cents.
 * @param {number} value
 */
export function roundHalfUp2(value) {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const cents = Math.floor(abs * 100 + 0.5);
  return (sign * cents) / 100;
}

/**
 * @param {Date|string} date
 */
function toDate(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Cycle length N = days in the calendar month of billing_cycle_start (SPEC: actual days of that cycle).
 * Cycle runs from billing_cycle_start for N days.
 * @param {string|Date} billingCycleStart
 * @param {string|Date} effectiveDate
 * @param {number} oldPrice
 * @param {number} newPrice
 */
export function computeProration(billingCycleStart, effectiveDate, oldPrice, newPrice) {
  const start = toDate(billingCycleStart);
  const D = toDate(effectiveDate);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const N = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cycleEnd = new Date(Date.UTC(year, month, start.getUTCDate() + N - 1));

  const msPerDay = 24 * 60 * 60 * 1000;
  let daysRemaining = Math.floor((cycleEnd.getTime() - D.getTime()) / msPerDay) + 1;
  if (daysRemaining < 0) daysRemaining = 0;
  if (daysRemaining > N) daysRemaining = N;

  const daysUsed = N - daysRemaining;
  const credit = roundHalfUp2((oldPrice * daysRemaining) / N);
  const charge = roundHalfUp2((newPrice * daysRemaining) / N);
  const net = roundHalfUp2(charge - credit);

  return {
    daysInCycle: N,
    daysRemaining,
    daysUsed,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: cycleEnd.toISOString().slice(0, 10),
    effectiveDate: D.toISOString().slice(0, 10),
    oldCredit: -credit,
    newCharge: charge,
    net,
  };
}
