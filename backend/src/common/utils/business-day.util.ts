/**
 * Business-day date helpers for the shop's Philippine operating calendar.
 *
 * The shop's business day does NOT run midnight-to-midnight. It runs from
 * 2:00 AM to 2:00 AM Philippine time (UTC+8, no daylight saving). So a sale
 * made at, e.g., Tuesday 1:30 AM PH still belongs to MONDAY's business day,
 * and only flips to Tuesday once the clock passes 2:00 AM.
 *
 * All functions work regardless of the server's own timezone by doing the
 * math in a "PH-shifted" clock and converting back to real UTC instants.
 */

// Philippine Standard Time is a fixed UTC+8 (no DST).
export const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

// The business day starts at 2:00 AM PH time.
export const BUSINESS_DAY_START_HOUR = 2;
const BUSINESS_DAY_START_MS = BUSINESS_DAY_START_HOUR * 60 * 60 * 1000;

/**
 * Returns the current moment expressed on a "PH business clock": real PH time
 * shifted back by 2 hours. On this clock, the calendar date is exactly the
 * business day the moment belongs to, and midnight on this clock is 2 AM PH.
 * Returned as a Date whose UTC getters read the shifted PH wall-clock.
 */
function phBusinessClock(at: Date = new Date()): Date {
  return new Date(at.getTime() + PH_OFFSET_MS - BUSINESS_DAY_START_MS);
}

/**
 * Converts a PH business-clock wall-clock time (given as UTC ms) back into the
 * real UTC instant it represents.
 */
function fromPhBusinessClock(ms: number): Date {
  return new Date(ms - PH_OFFSET_MS + BUSINESS_DAY_START_MS);
}

/**
 * Start of the current business DAY as a real UTC instant.
 * i.e. the most recent 2:00 AM PH boundary at or before `at`.
 */
export function startOfBusinessDay(at: Date = new Date()): Date {
  const clock = phBusinessClock(at);
  const midnight = Date.UTC(
    clock.getUTCFullYear(),
    clock.getUTCMonth(),
    clock.getUTCDate(),
  );
  return fromPhBusinessClock(midnight);
}

/**
 * The business-day calendar DATE (a @db.Date-friendly midnight-UTC Date) that
 * `at` belongs to. Used for the per-branch daily sale-number counter so the
 * counter resets at 2 AM PH, not midnight. Example: a sale at Tue 1:30 AM PH
 * returns Monday's date.
 */
export function businessDateOnly(at: Date = new Date()): Date {
  const clock = phBusinessClock(at);
  // A pure calendar date at UTC midnight (matches Prisma @db.Date semantics).
  return new Date(
    Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate()),
  );
}

/**
 * Start of the current business WEEK as a real UTC instant. Weeks start on
 * MONDAY at 2:00 AM PH.
 */
export function startOfBusinessWeek(at: Date = new Date()): Date {
  const clock = phBusinessClock(at);
  // getUTCDay: 0=Sun..6=Sat. Days to subtract to reach Monday.
  const day = clock.getUTCDay();
  const daysSinceMonday = (day + 6) % 7; // Mon->0, Tue->1, ... Sun->6
  const mondayMidnight = Date.UTC(
    clock.getUTCFullYear(),
    clock.getUTCMonth(),
    clock.getUTCDate() - daysSinceMonday,
  );
  return fromPhBusinessClock(mondayMidnight);
}

/**
 * Start of the current business MONTH as a real UTC instant. Months start on
 * the 1st at 2:00 AM PH.
 */
export function startOfBusinessMonth(at: Date = new Date()): Date {
  const clock = phBusinessClock(at);
  const firstMidnight = Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), 1);
  return fromPhBusinessClock(firstMidnight);
}

/**
 * The Postgres expression that maps a stored UTC timestamp column to its PH
 * business-day clock, so date_trunc() buckets align to the 2 AM PH boundary
 * with Monday-based weeks. Shift by +8h (to PH) then -2h (business start).
 *
 * `col` must be a trusted, hard-coded column name (never user input).
 */
export function phBusinessClockSql(col: string): string {
  return `(${col} + interval '${PH_OFFSET_MS / 3600000} hours' - interval '${BUSINESS_DAY_START_HOUR} hours')`;
}
