// Who opened which client's record, and when: for GDPR accountability. Repeated views of the same thing
// by the same person within 10 minutes count once.
import { pool } from "./db";

export async function logAccess(requestId: string, staffId: string, what: string): Promise<void> {
  await pool
    .query(
      `INSERT INTO access_log (request_id, staff_id, what)
       SELECT $1, $2, $3 WHERE NOT EXISTS (
         SELECT 1 FROM access_log WHERE request_id = $1 AND staff_id = $2 AND what = $3 AND at > now() - interval '10 minutes')`,
      [requestId, staffId, what],
    )
    .catch((err) => console.error("EAP access log failed:", err));
}

export type AccessEntry = { at: Date; staff: string | null; role: string | null; what: string };

export async function accessLog(requestId: string, limit = 50): Promise<AccessEntry[]> {
  const { rows } = await pool.query<AccessEntry>(
    `SELECT a.at, s.name AS staff, s.role, a.what FROM access_log a LEFT JOIN staff s ON s.id = a.staff_id
     WHERE a.request_id = $1 ORDER BY a.at DESC LIMIT $2`,
    [requestId, limit],
  );
  return rows;
}
