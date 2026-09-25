import { offerToNext } from "./assign";
import { pool } from "./db";
import { offerReminderAt, respondBy } from "./deadlines";
import { dailyDigest, nobodyAvailable, offerReleased, offerReminder, sendEmail, therapistAlert } from "./email";

// Coordinators get pool alerts and the daily summary; if there are none, admins do.
export async function coordinatorEmails(): Promise<string[]> {
  const { rows } = await pool.query<{ email: string; role: string }>(
    "SELECT email, role FROM staff WHERE role IN ('coordinator', 'admin') AND password_hash <> '!'",
  );
  const coordinators = rows.filter((r) => r.role === "coordinator").map((r) => r.email);
  return coordinators.length ? coordinators : rows.map((r) => r.email);
}

const note = (requestId: string, staffId: string | null, body: string) =>
  pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [requestId, staffId, body]);

async function sendAll(mails: Parameters<typeof sendEmail>[0][]) {
  const sent = await Promise.allSettled(mails.map(sendEmail));
  for (const s of sent) if (s.status === "rejected") console.error("EAP email failed:", s.reason);
}

/** The assigned counsellor accepts the client. Returns false if it's no longer theirs to accept. */
export async function acceptOffer(requestId: string, staffId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE support_requests SET accepted_at = now(), respond_by = NULL, updated_at = now()
     WHERE id = $1 AND assigned_to = $2 AND accepted_at IS NULL`,
    [requestId, staffId],
  );
  if (rowCount) await note(requestId, staffId, "Accepted the client.");
  return !!rowCount;
}

/**
 * The offered counsellor declined or didn't answer in time: the client goes straight to the next
 * available counsellor. Only if nobody is available does the coordinator hear about it.
 */
async function passOn(requestId: string, counsellorId: string, reason: "declined" | "no-reply", why = "") {
  const { rows } = await pool.query<{ first_name: string; crisis: boolean; name: string; email: string }>(
    `UPDATE support_requests r SET assigned_to = NULL, assigned_at = NULL, accepted_at = NULL, respond_by = NULL,
       declined_by = array_append(r.declined_by, $2::uuid), updated_at = now()
     FROM staff s WHERE r.id = $1 AND r.assigned_to = $2 AND s.id = $2
     RETURNING r.first_name, r.crisis, s.name, s.email`,
    [requestId, counsellorId],
  );
  const r = rows[0];
  if (!r) return false;
  await note(
    requestId,
    reason === "declined" ? counsellorId : null,
    reason === "declined" ? `Declined the client${why ? `: "${why}"` : ""}.` : `${r.name} didn't answer in time.`,
  );
  const next = await offerToNext(requestId);
  const mails = [offerReleased(r.email, r.name, r.first_name, reason)];
  if (next) mails.push(therapistAlert(next.therapist.email, next.therapist.name, requestId, next.crisis, next.respondBy));
  else for (const to of await coordinatorEmails()) mails.push(nobodyAvailable(to, r.first_name, requestId, r.crisis));
  await sendAll(mails);
  return true;
}

export const declineOffer = (requestId: string, staffId: string, why: string) =>
  passOn(requestId, staffId, "declined", why.trim().slice(0, 500));

/** A counsellor takes a client from the pool. Returns false if someone else got there first. */
export async function takeFromPool(requestId: string, staffId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE support_requests SET assigned_to = $2, assigned_at = now(), accepted_at = now(), respond_by = NULL,
       in_pool = false, overdue_warned_at = NULL, updated_at = now()
     WHERE id = $1 AND assigned_to IS NULL AND status = 'new'`,
    [requestId, staffId],
  );
  if (rowCount) await note(requestId, staffId, "Took the client from the pool.");
  return !!rowCount;
}

/** A coordinator gives a case to a counsellor: as an offer to accept, or already agreed with them. */
export async function offerTo(requestId: string, counsellorId: string, byStaffId: string, alreadyAgreed: boolean) {
  const { rows } = await pool.query<{ crisis: boolean; name: string; email: string }>(
    `SELECT r.crisis, s.name, s.email FROM support_requests r, staff s WHERE r.id = $1 AND s.id = $2`,
    [requestId, counsellorId],
  );
  const r = rows[0];
  if (!r) return;
  const deadline = alreadyAgreed ? null : respondBy(new Date(), r.crisis);
  await pool.query(
    `UPDATE support_requests SET assigned_to = $2, assigned_at = now(), in_pool = false, overdue_warned_at = NULL,
       offer_reminded_at = NULL,
       accepted_at = CASE WHEN $3::timestamptz IS NULL THEN now() END, respond_by = $3, updated_at = now()
     WHERE id = $1`,
    [requestId, counsellorId, deadline],
  );
  await note(
    requestId,
    byStaffId,
    alreadyAgreed ? `Assigned to ${r.name} (agreed with them).` : `Offered to ${r.name}, waiting for them to accept.`,
  );
  if (deadline) await sendAll([therapistAlert(r.email, r.name, requestId, r.crisis, deadline)]);
}

/** Halfway to the answer-by time, reminds a counsellor who hasn't answered an offer yet (once per offer). */
export async function remindPendingOffers(now = new Date()): Promise<number> {
  const { rows } = await pool.query<{
    id: string;
    crisis: boolean;
    assigned_at: Date;
    respond_by: Date;
    name: string;
    email: string;
  }>(
    `SELECT r.id, r.crisis, r.assigned_at, r.respond_by, s.name, s.email
     FROM support_requests r JOIN staff s ON s.id = r.assigned_to
     WHERE r.accepted_at IS NULL AND r.status = 'new' AND r.offer_reminded_at IS NULL AND r.respond_by > $1`,
    [now],
  );
  let n = 0;
  for (const r of rows) {
    if (offerReminderAt(r.assigned_at, r.crisis) > now) continue;
    await sendAll([offerReminder(r.email, r.name, r.id, r.crisis, r.respond_by)]);
    await pool.query("UPDATE support_requests SET offer_reminded_at = now() WHERE id = $1", [r.id]);
    await note(r.id, null, `Reminder emailed to ${r.name} to accept or decline.`);
    n++;
  }
  return n;
}

/** Offers nobody answered in time pass to the next available counsellor. */
export async function releaseExpiredOffers(): Promise<number> {
  const { rows } = await pool.query<{ id: string; assigned_to: string }>(
    `SELECT id, assigned_to FROM support_requests
     WHERE assigned_to IS NOT NULL AND accepted_at IS NULL AND respond_by < now() AND status = 'new'`,
  );
  let n = 0;
  for (const r of rows) if (await passOn(r.id, r.assigned_to, "no-reply")) n++;
  return n;
}

/** Once a day, from 08:00 Prague time: a summary for the coordinator. Returns true when it sent one. */
export async function sendDailyDigest(now = new Date()): Promise<boolean> {
  const prague = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const today = `${prague.year}-${prague.month}-${prague.day}`;
  if (Number(prague.hour) < 8) return false;
  // Claim today's digest first, so two overlapping runs can't both send it.
  const { rowCount } = await pool.query(
    `INSERT INTO app_state (key, value) VALUES ('digest_date', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE app_state.value <> EXCLUDED.value`,
    [today],
  );
  if (!rowCount) return false;
  const { rows } = await pool.query<{ pool: number; crisis_in_pool: number; awaiting: number; overdue: number }>(
    `SELECT
       count(*) FILTER (WHERE assigned_to IS NULL AND status = 'new')::int AS pool,
       count(*) FILTER (WHERE assigned_to IS NULL AND status = 'new' AND crisis)::int AS crisis_in_pool,
       count(*) FILTER (WHERE assigned_to IS NOT NULL AND accepted_at IS NULL AND status = 'new')::int AS awaiting,
       count(*) FILTER (WHERE status = 'new' AND contact_missed_at IS NOT NULL)::int AS overdue
     FROM support_requests`,
  );
  const d = rows[0];
  await sendAll(
    (await coordinatorEmails()).map((to) =>
      dailyDigest(to, { pool: d.pool, crisisInPool: d.crisis_in_pool, awaiting: d.awaiting, overdue: d.overdue }),
    ),
  );
  return true;
}
