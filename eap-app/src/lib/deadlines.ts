// A case still "New" this long after it came in hasn't been contacted in time.
export const CONTACT_WITHIN_HOURS = 24;
export const CRISIS_CONTACT_WITHIN_HOURS = 2;

// How long an assigned counsellor has to accept or decline a new client before it goes back to the pool.
// Working hours: Saturdays and Sundays (Prague time) don't count. Crisis cases use plain clock hours.
export const RESPOND_WITHIN_WORKING_HOURS = 24;
export const CRISIS_RESPOND_WITHIN_HOURS = 2;

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Prague" });
const isWeekend = (d: Date) => {
  const w = weekday.format(d);
  return w === "Sat" || w === "Sun";
};

const STEP_MS = 15 * 60_000;

/** `from` plus `hours`, counting only time that falls on Monday–Friday in Prague. */
export function addWorkingHours(from: Date, hours: number): Date {
  let t = from.getTime();
  let remaining = hours * 3600_000;
  while (remaining > 0) {
    const step = Math.min(STEP_MS, remaining);
    if (!isWeekend(new Date(t))) remaining -= step;
    t += step;
  }
  return new Date(t);
}

export function respondBy(assignedAt: Date, crisis: boolean): Date {
  return crisis
    ? new Date(assignedAt.getTime() + CRISIS_RESPOND_WITHIN_HOURS * 3600_000)
    : addWorkingHours(assignedAt, RESPOND_WITHIN_WORKING_HOURS);
}

// Cancelling a session with less notice than this counts as one of the client's sessions.
// The client's reminder email goes out just before this point, so they can still cancel in time.
export const LATE_CANCEL_HOURS = 48;
