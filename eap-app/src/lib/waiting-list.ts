// The waiting list: clients the coordinator couldn't place yet. When a counsellor starts taking new
// clients again, coordinators are told which waiting clients they could take.
import { speaks, takesType, type TherapistLoad } from "./assign";
import { pool } from "./db";
import { sendEmail, waitingListMatches } from "./email";
import { coordinatorEmails } from "./offers";

/** Emails coordinators if waiting clients match a counsellor who has just become available. */
export async function notifyWaitingMatches(staffId: string): Promise<number> {
  const { rows: staff } = await pool.query<Pick<TherapistLoad, "languages" | "accepts"> & { name: string }>(
    "SELECT name, languages, accepts FROM staff WHERE id = $1 AND takes_clients",
    [staffId],
  );
  if (!staff[0]) return 0;
  const { rows: waiting } = await pool.query<{ id: string; first_name: string; language: string; service: string; kind: "eap" | "private" }>(
    `SELECT id, first_name, language, service, kind FROM support_requests
     WHERE waitlisted_at IS NOT NULL AND assigned_to IS NULL AND status NOT IN ('completed', 'closed')
     ORDER BY waitlisted_at`,
  );
  const matches = waiting.filter((w) => speaks(staff[0], w.language) && takesType(staff[0], w.service, w.kind));
  if (!matches.length) return 0;
  const to = await coordinatorEmails();
  await Promise.allSettled(to.map((t) => sendEmail(waitingListMatches(t, staff[0].name, matches))));
  return matches.length;
}
