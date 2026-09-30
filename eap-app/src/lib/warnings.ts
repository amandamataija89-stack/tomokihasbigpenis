// Keeping counsellors' records up to date: a reminder when a session isn't marked done 24 hours after it,
// formal warnings sent by a coordinator or admin, and suspension from new clients at the third warning.
import { pool } from "./db";
import { counsellorSuspended, counsellorWarning, sendEmail, unmarkedEscalation, unmarkedSessionsReminder } from "./email";
import { coordinatorEmails } from "./offers";

export const WARNINGS_BEFORE_SUSPENSION = 3;

const whenFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });
export const formatWhen = (d: Date) => whenFmt.format(d);

/**
 * Hourly, for sessions still not marked (Done, Late cancellation or Removed) after they started:
 * reminder 1 at 24 hours, reminder 2 at 48 hours, and at 72 hours the owner is told and the counsellor
 * gets a formal warning (which counts towards suspension).
 */
export async function remindUnmarkedSessions(now = new Date()): Promise<number> {
  let sent = 0;
  for (const stage of [1, 2, 3] as const) {
    const { rows } = await pool.query<{ id: string; staff_id: string; email: string; name: string; first_name: string; starts_at: Date; request_id: string }>(
      `SELECT cs.id, s.id AS staff_id, s.email, s.name, r.first_name, cs.starts_at, r.id AS request_id
       FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id JOIN staff s ON s.id = r.assigned_to
       WHERE cs.done_at IS NULL AND cs.unmarked_reminders = $2 - 1 AND r.status <> 'closed'
         AND cs.starts_at < $1::timestamptz - make_interval(hours => 24 * $2)
         -- a day between steps, even for a session that was already days old
         AND (cs.unmarked_reminded_at IS NULL OR cs.unmarked_reminded_at < $1::timestamptz - interval '23 hours')
       ORDER BY cs.starts_at`,
      [now, stage],
    );
    const byStaff = new Map<string, typeof rows>();
    for (const r of rows) byStaff.set(r.staff_id, [...(byStaff.get(r.staff_id) ?? []), r]);
    for (const [staffId, list] of byStaff) {
      const sessions = list.map((l) => ({ client: l.first_name, when: formatWhen(l.starts_at), requestId: l.request_id }));
      try {
        if (stage < 3) {
          await sendEmail(unmarkedSessionsReminder(list[0].email, list[0].name, sessions, stage === 1 ? 1 : 2));
        } else {
          const reason = `Sessions still not marked in the app 3 days after they happened, despite 2 reminders:\n${sessions
            .map((x) => `- ${x.client}, ${x.when}`)
            .join("\n")}`;
          const r = await issueWarning(staffId, null, reason);
          const owners = await ownerEmails();
          await Promise.allSettled(owners.map((o) => sendEmail(unmarkedEscalation(o, list[0].name, staffId, sessions, r.count, r.suspended))));
        }
        await pool.query("UPDATE client_sessions SET unmarked_reminders = $2, unmarked_reminded_at = now() WHERE id = ANY($1::uuid[])", [
          list.map((l) => l.id),
          stage,
        ]);
        sent++;
      } catch (err) {
        console.error("EAP unmarked sessions reminder failed:", err);
      }
    }
  }
  return sent;
}

/** The owner (or, if none is set, the admins). */
async function ownerEmails(): Promise<string[]> {
  const { rows } = await pool.query<{ email: string }>(
    `SELECT email FROM staff WHERE password_hash <> '!' AND (is_owner OR (role = 'admin' AND NOT EXISTS (SELECT 1 FROM staff WHERE is_owner)))`,
  );
  return rows.map((r) => r.email);
}

export type Warning = { id: string; reason: string; created_at: Date; issued_by_name: string | null; cleared_at: Date | null };

export async function warningsFor(staffId: string): Promise<Warning[]> {
  const { rows } = await pool.query<Warning>(
    `SELECT w.id, w.reason, w.created_at, s.name AS issued_by_name, w.cleared_at
     FROM staff_warnings w LEFT JOIN staff s ON s.id = w.issued_by WHERE w.staff_id = $1 ORDER BY w.created_at DESC`,
    [staffId],
  );
  return rows;
}

/** Records and emails a formal warning; the third active one suspends the counsellor from new clients. */
export async function issueWarning(staffId: string, issuedBy: string | null, reason: string): Promise<{ count: number; suspended: boolean }> {
  await pool.query("INSERT INTO staff_warnings (staff_id, reason, issued_by) VALUES ($1, $2, $3)", [staffId, reason, issuedBy]);
  const { rows } = await pool.query<{ n: number; email: string; name: string; suspended: boolean }>(
    `SELECT (SELECT count(*)::int FROM staff_warnings WHERE staff_id = s.id AND cleared_at IS NULL) AS n,
       s.email, s.name, s.suspended_at IS NOT NULL AS suspended
     FROM staff s WHERE s.id = $1`,
    [staffId],
  );
  const s = rows[0];
  await sendEmail(counsellorWarning(s.email, s.name, reason, s.n, WARNINGS_BEFORE_SUSPENSION)).catch((err) =>
    console.error("EAP warning email failed:", err),
  );
  if (s.n >= WARNINGS_BEFORE_SUSPENSION && !s.suspended) {
    await pool.query("UPDATE staff SET suspended_at = now(), takes_clients = false WHERE id = $1", [staffId]);
    const to = [...new Set([s.email, ...(await coordinatorEmails())])];
    await Promise.allSettled(to.map((t) => sendEmail(counsellorSuspended(t, s.name, t === s.email))));
    return { count: s.n, suspended: true };
  }
  return { count: s.n, suspended: s.suspended };
}

/** Lifts a suspension: warnings so far stop counting and the counsellor can take new clients again. */
export async function liftSuspension(staffId: string): Promise<void> {
  await pool.query("UPDATE staff_warnings SET cleared_at = now() WHERE staff_id = $1 AND cleared_at IS NULL", [staffId]);
  await pool.query("UPDATE staff SET suspended_at = NULL, takes_clients = true WHERE id = $1", [staffId]);
}
