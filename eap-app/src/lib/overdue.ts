import { pool } from "./db";
import { addWorkingHours, CONTACT_WITHIN_HOURS, CRISIS_CONTACT_WITHIN_HOURS } from "./deadlines";
import { overdueWarning, sendEmail } from "./email";

type Accepted = {
  id: string;
  first_name: string;
  crisis: boolean;
  accepted_at: Date;
  counsellor_name: string;
  counsellor_email: string;
};

/** When first contact is due for a case the counsellor has accepted. */
export const contactDue = (acceptedAt: Date, crisis: boolean) =>
  crisis
    ? new Date(acceptedAt.getTime() + CRISIS_CONTACT_WITHIN_HOURS * 3600_000)
    : addWorkingHours(acceptedAt, CONTACT_WITHIN_HOURS);

/**
 * Reminds the counsellor, once, about each case they accepted but haven't contacted in time
 * (still New 24 working hours after accepting, or 2 hours for a crisis). Run it hourly.
 */
export async function warnOverdue(now = new Date()): Promise<{ warned: number; failed: number }> {
  const { rows } = await pool.query<Accepted>(
    `SELECT r.id, r.first_name, r.crisis, r.accepted_at, s.name AS counsellor_name, s.email AS counsellor_email
     FROM support_requests r JOIN staff s ON s.id = r.assigned_to
     WHERE r.status = 'new' AND r.accepted_at IS NOT NULL AND r.overdue_warned_at IS NULL`,
  );
  let warned = 0;
  let failed = 0;
  for (const r of rows) {
    if (contactDue(r.accepted_at, r.crisis) > now) continue;
    const hours = r.crisis ? CRISIS_CONTACT_WITHIN_HOURS : CONTACT_WITHIN_HOURS;
    try {
      await sendEmail(overdueWarning(r.counsellor_email, r.counsellor_name, r.first_name, r.id, hours, r.crisis));
    } catch (err) {
      console.error("EAP overdue warning failed:", err);
      failed++;
      continue;
    }
    await pool.query("UPDATE support_requests SET overdue_warned_at = now() WHERE id = $1", [r.id]);
    await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
      r.id,
      `Reminder emailed to ${r.counsellor_name}: accepted but not contacted within ${hours}${r.crisis ? "" : " working"} hours.`,
    ]);
    warned++;
  }
  return { warned, failed };
}
