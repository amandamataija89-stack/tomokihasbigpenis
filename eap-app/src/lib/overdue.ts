import { pool } from "./db";
import { CONTACT_WITHIN_HOURS, CRISIS_CONTACT_WITHIN_HOURS } from "./deadlines";
import { overdueWarning, sendEmail, teamOverdueWarning } from "./email";

type Overdue = {
  id: string;
  first_name: string;
  crisis: boolean;
  created_at: Date;
  counsellor_name: string | null;
  counsellor_email: string | null;
};

/**
 * Emails a warning for each case still New past its contact deadline: to the assigned counsellor,
 * or to the team if nobody is assigned. Each case is warned once per assignment. Run it hourly.
 */
export async function warnOverdue(): Promise<{ warned: number; failed: number }> {
  const { rows } = await pool.query<Overdue>(
    `SELECT r.id, r.first_name, r.crisis, r.created_at, s.name AS counsellor_name, s.email AS counsellor_email
     FROM support_requests r LEFT JOIN staff s ON s.id = r.assigned_to
     WHERE r.status = 'new' AND r.overdue_warned_at IS NULL
       AND r.created_at < now() - make_interval(hours => CASE WHEN r.crisis THEN $1::int ELSE $2::int END)
     ORDER BY r.created_at`,
    [CRISIS_CONTACT_WITHIN_HOURS, CONTACT_WITHIN_HOURS],
  );
  let warned = 0;
  let failed = 0;
  for (const r of rows) {
    const hours = r.crisis ? CRISIS_CONTACT_WITHIN_HOURS : CONTACT_WITHIN_HOURS;
    try {
      await sendEmail(
        r.counsellor_email
          ? overdueWarning(r.counsellor_email, r.counsellor_name ?? "", r.first_name, r.id, hours, r.crisis)
          : teamOverdueWarning(r.first_name, r.id, hours, r.crisis),
      );
    } catch (err) {
      console.error("EAP overdue warning failed:", err);
      failed++;
      continue;
    }
    await pool.query("UPDATE support_requests SET overdue_warned_at = now() WHERE id = $1", [r.id]);
    await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
      r.id,
      r.counsellor_email
        ? `Reminder emailed to ${r.counsellor_name}: not contacted within ${hours} hours.`
        : `Reminder emailed to the team: not contacted within ${hours} hours and nobody is assigned.`,
    ]);
    warned++;
  }
  return { warned, failed };
}
