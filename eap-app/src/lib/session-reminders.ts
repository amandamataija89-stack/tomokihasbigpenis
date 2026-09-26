import { pool } from "./db";
import { LATE_CANCEL_HOURS } from "./deadlines";
import { formatDeadline, sendEmail, sessionReminder } from "./email";
import { sessionLimit, type ClientKind } from "./data";
import { clientMessageLink } from "./messages";

const whenFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Prague",
});

/**
 * Hourly: emails each client a reminder about 48 hours before a session (an hour early, so they can
 * still cancel in time). Sessions booked less than 48 hours ahead get no reminder: the booking email
 * has just gone out.
 */
export async function sendSessionReminders(now = new Date()): Promise<number> {
  const { rows } = await pool.query<{
    id: string;
    request_id: string;
    starts_at: Date;
    email: string;
    first_name: string;
    format: string;
    therapist: string | null;
    number: number;
    kind: ClientKind;
  }>(
    `SELECT cs.id, cs.request_id, cs.starts_at, r.email, r.first_name, r.format, r.kind, s.name AS therapist,
       (SELECT count(*)::int FROM client_sessions o WHERE o.request_id = r.id AND o.starts_at <= cs.starts_at) AS number
     FROM client_sessions cs
     JOIN support_requests r ON r.id = cs.request_id
     LEFT JOIN staff s ON s.id = r.assigned_to
     WHERE cs.done_at IS NULL AND cs.reminder_sent_at IS NULL AND r.status <> 'closed'
       AND cs.starts_at > $1
       AND cs.starts_at <= $1 + make_interval(hours => $2 + 1)
       AND cs.created_at < cs.starts_at - make_interval(hours => $2)`,
    [now, LATE_CANCEL_HOURS],
  );
  let sent = 0;
  for (const r of rows) {
    try {
      await sendEmail(
        sessionReminder({
          to: r.email,
          firstName: r.first_name,
          when: whenFmt.format(r.starts_at),
          number: r.number,
          total: sessionLimit(r.kind),
          format: r.format,
          therapistName: r.therapist,
          lateCancelHours: LATE_CANCEL_HOURS,
          messageLink: await clientMessageLink(r.request_id),
          cancelBy: formatDeadline(new Date(r.starts_at.getTime() - LATE_CANCEL_HOURS * 3600_000)),
        }),
      );
    } catch (err) {
      console.error("EAP session reminder failed:", err);
      continue;
    }
    await pool.query("UPDATE client_sessions SET reminder_sent_at = now() WHERE id = $1", [r.id]);
    sent++;
  }
  return sent;
}
