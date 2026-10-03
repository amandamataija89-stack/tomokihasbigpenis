// All deadlines count from when the client submits the form, so they add up to the promise
// the client is given: contact within 24 working hours (Monday–Friday). Prague Integration is not an
// emergency service, so urgent (crisis) requests have the same timings; they're flagged so staff see
// them first, and clients are told to call 112 or 116 123 in an emergency.

export const CONTACT_WITHIN_HOURS = 24; // working hours

// The counsellor gets a reminder this long after the client submitted, if they still haven't made contact.
export const CONTACT_REMINDER_AFTER_HOURS = 18; // working hours

// How long a counsellor has to accept or decline an offer before it passes to the next counsellor.
export const ACCEPT_WITHIN_WORKING_HOURS = 24; // Monday–Friday; reminder halfway
export const OFFICE_OPENS = 8; // 08:00 Prague time
export const OFFICE_CLOSES = 18; // 18:00 Prague time

// Cancelling a session with less notice than this counts as one of the client's sessions.
// The client's reminder email goes out just before this point, so they can still cancel in time.
export const LATE_CANCEL_HOURS = 48;

const pragueClock = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Prague",
});
function prague(d: Date): { weekend: boolean; hour: number } {
  const parts = Object.fromEntries(pragueClock.formatToParts(d).map((p) => [p.type, p.value]));
  return { weekend: parts.weekday === "Sat" || parts.weekday === "Sun", hour: Number(parts.hour) };
}

const STEP_MS = 15 * 60_000;

// `from` plus `hours`, counting only the moments `counts` accepts (checked in 15-minute steps).
function addCounted(from: Date, hours: number, counts: (d: Date) => boolean): Date {
  let t = from.getTime();
  let remaining = hours * 3600_000;
  while (remaining > 0) {
    const step = Math.min(STEP_MS, remaining);
    if (counts(new Date(t))) remaining -= step;
    t += step;
  }
  return new Date(t);
}

/** `from` plus `hours`, counting only time that falls on Monday–Friday in Prague. */
export const addWorkingHours = (from: Date, hours: number) => addCounted(from, hours, (d) => !prague(d).weekend);

/** `from` plus `hours`, counting only Monday–Friday 08:00–18:00 in Prague. */
export const addOfficeHours = (from: Date, hours: number) =>
  addCounted(from, hours, (d) => {
    const p = prague(d);
    return !p.weekend && p.hour >= OFFICE_OPENS && p.hour < OFFICE_CLOSES;
  });

/** When the client was promised first contact. (`_crisis` kept for callers: same promise for everyone.) */
export const contactDue = (submittedAt: Date, _crisis?: boolean) => addWorkingHours(submittedAt, CONTACT_WITHIN_HOURS);

/** When the counsellor is reminded to make contact. */
export const contactReminderAt = (submittedAt: Date, _crisis?: boolean) => addWorkingHours(submittedAt, CONTACT_REMINDER_AFTER_HOURS);

/** Answer-by time for an offer made at `offeredAt`. */
export const respondBy = (offeredAt: Date, _crisis?: boolean) => addWorkingHours(offeredAt, ACCEPT_WITHIN_WORKING_HOURS);

/** When to remind a counsellor who hasn't answered an offer yet: halfway to the answer-by time. */
export const offerReminderAt = (offeredAt: Date, _crisis?: boolean) => addWorkingHours(offeredAt, ACCEPT_WITHIN_WORKING_HOURS / 2);
