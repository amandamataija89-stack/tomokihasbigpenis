import { pool } from "./db";
import { contactDue, contactReminderAt } from "./deadlines";
import { contactMissed, formatDeadline, lateDiscoveryOffer, overdueWarning, sendEmail } from "./email";
import { coordinatorEmails } from "./offers";

type Open = {
  id: string;
  first_name: string;
  crisis: boolean;
  created_at: Date;
  overdue_warned_at: Date | null;
  contact_missed_at: Date | null;
  counsellor_name: string | null;
  counsellor_email: string | null;
};

/**
 * Hourly, for clients still marked New, counted from when they submitted the form:
 * - at 18 working hours (1 hour for a crisis) the counsellor who has them is reminded, once per counsellor;
 * - at the promised 24 working hours (2 hours for a crisis) the coordinator and counsellor are told, once.
 */
export async function warnOverdue(now = new Date()): Promise<{ warned: number; missed: number; failed: number }> {
  const { rows } = await pool.query<Open>(
    `SELECT r.id, r.first_name, r.crisis, r.created_at, r.overdue_warned_at, r.contact_missed_at,
       s.name AS counsellor_name, s.email AS counsellor_email
     FROM support_requests r LEFT JOIN staff s ON s.id = r.assigned_to
     WHERE r.status = 'new' AND (r.contact_missed_at IS NULL OR (r.overdue_warned_at IS NULL AND r.assigned_to IS NOT NULL))`,
  );
  let warned = 0;
  let missed = 0;
  let failed = 0;
  for (const r of rows) {
    const due = contactDue(r.created_at, r.crisis);
    try {
      if (!r.contact_missed_at && due <= now) {
        const to = await coordinatorEmails();
        if (r.counsellor_email) to.push(r.counsellor_email);
        await Promise.all(
          [...new Set(to)].map((t) => sendEmail(contactMissed(t, r.first_name, r.id, r.counsellor_name, r.crisis))),
        );
        await pool.query("UPDATE support_requests SET contact_missed_at = now(), overdue_warned_at = coalesce(overdue_warned_at, now()) WHERE id = $1", [r.id]);
        await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
          r.id,
          "Contact promise missed: the coordinator has been told.",
        ]);
        missed++;
      } else if (r.counsellor_email && !r.overdue_warned_at && contactReminderAt(r.created_at, r.crisis) <= now) {
        await sendEmail(overdueWarning(r.counsellor_email, r.counsellor_name ?? "", r.first_name, r.id, formatDeadline(due), r.crisis));
        await pool.query("UPDATE support_requests SET overdue_warned_at = now() WHERE id = $1", [r.id]);
        await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
          r.id,
          `Reminder emailed to ${r.counsellor_name}: contact the client by ${formatDeadline(due)}.`,
        ]);
        warned++;
      }
    } catch (err) {
      console.error("EAP contact reminder failed:", err);
      failed++;
    }
  }
  return { warned, missed, failed };
}

/**
 * Hourly: a private client whose counsellor hasn't offered the free discovery session (or messaged or
 * booked them) within 24 hours of being assigned goes back to the pool (only coordinators and admins
 * see it), and they're told, to assign someone else: we promise another counsellor after 24 hours.
 */
export async function alertLateDiscoveryOffers(now = new Date()): Promise<number> {
  const { rows } = await pool.query<{ id: string; first_name: string; crisis: boolean; counsellor: string | null; assigned_at: Date }>(
    `SELECT r.id, r.first_name, r.crisis, s.name AS counsellor, r.assigned_at
     FROM support_requests r JOIN staff s ON s.id = r.assigned_to
     WHERE r.kind = 'private' AND r.status NOT IN ('completed', 'closed') AND r.offer_late_alerted_at IS NULL
       AND r.discovery_offered_at IS NULL AND r.assigned_at < $1::timestamptz - interval '24 hours'
       AND NOT EXISTS (SELECT 1 FROM client_messages m WHERE m.request_id = r.id AND m.sender = 'staff')
       AND NOT EXISTS (SELECT 1 FROM client_sessions cs WHERE cs.request_id = r.id)`,
    [now],
  );
  if (!rows.length) return 0;
  const to = await coordinatorEmails();
  for (const r of rows) {
    await Promise.allSettled(to.map((t) => sendEmail(lateDiscoveryOffer(t, r.first_name, r.id, r.counsellor ?? "their counsellor", r.crisis))));
    await pool.query(
      `UPDATE support_requests SET offer_late_alerted_at = now(), assigned_to = NULL, assigned_at = NULL, accepted_at = NULL,
         respond_by = NULL, status = 'new', updated_at = now()
       WHERE id = $1`,
      [r.id],
    );
    await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
      r.id,
      `Not contacted within 24 hours of ${r.counsellor ?? "the counsellor"} being assigned: back in the pool for the coordinator to assign someone else.`,
    ]);
  }
  return rows.length;
}
