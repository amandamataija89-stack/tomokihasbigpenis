// How long we keep data (see the Privacy Policy): client records 3 years after the last contact, invoices
// and payment records 10 years (Czech tax law: from the end of the year they were issued). Runs daily.
import { pool } from "./db";

export const CLIENT_RECORD_YEARS = 3;
export const INVOICE_YEARS = 10;

// A case's last contact: its latest session, message or change.
const LAST_CONTACT = `GREATEST(
  r.updated_at, r.created_at,
  COALESCE((SELECT max(starts_at) FROM client_sessions WHERE request_id = r.id), r.created_at),
  COALESCE((SELECT max(created_at) FROM client_messages WHERE request_id = r.id), r.created_at))`;

export type RetentionResult = { deleted: number; reduced: number; invoicesDeleted: number };

export async function applyRetention(now = new Date()): Promise<RetentionResult> {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - CLIENT_RECORD_YEARS);

  // 1. Invoices whose 10 years have passed (counted from the end of the year they were issued or paid).
  const { rowCount: invoicesDeleted } = await pool.query(
    `WITH gone AS (
       DELETE FROM payments
       WHERE make_date(extract(year FROM COALESCE(invoiced_at, paid_on::timestamptz, created_at) AT TIME ZONE 'Europe/Prague')::int, 12, 31)
             + make_interval(years => $1) < $2::date
       RETURNING id)
     SELECT 1 FROM gone`,
    [INVOICE_YEARS, now],
  );
  await pool.query("DELETE FROM bank_transactions WHERE booked_on < ($1::date - make_interval(years => $2 + 1))", [now, INVOICE_YEARS]);

  // 2. Cases with no contact for 3 years.
  const { rows: old } = await pool.query<{ id: string; invoiced: boolean }>(
    `SELECT r.id, EXISTS (SELECT 1 FROM payments WHERE request_id = r.id) AS invoiced
     FROM support_requests r
     WHERE ${LAST_CONTACT} < $1 AND (r.anonymized_at IS NULL OR NOT EXISTS (SELECT 1 FROM payments WHERE request_id = r.id))`,
    [cutoff],
  );
  let deleted = 0;
  let reduced = 0;
  for (const r of old) {
    if (!r.invoiced) {
      // Nothing we must keep: the whole case goes (notes, sessions, messages, consent form with it).
      await pool.query("DELETE FROM support_requests WHERE id = $1", [r.id]);
      deleted++;
      continue;
    }
    // Invoices must stay: keep only what they show (name, address, invoice details, variable symbol and
    // the sessions they cover); everything about the client's wellbeing and contact goes.
    await pool.query("DELETE FROM request_notes WHERE request_id = $1", [r.id]);
    await pool.query("DELETE FROM counsellor_notes WHERE request_id = $1", [r.id]);
    await pool.query("DELETE FROM client_messages WHERE request_id = $1", [r.id]);
    await pool.query("DELETE FROM message_links WHERE request_id = $1", [r.id]);
    await pool.query("DELETE FROM consent_forms WHERE request_id = $1", [r.id]);
    await pool.query("DELETE FROM client_sessions WHERE request_id = $1 AND payment_id IS NULL", [r.id]);
    await pool.query(
      `UPDATE support_requests SET message = '', topics = '{}', phone = '', email = '', crisis = false, age_range = '',
         gender = '', location = '', status = 'closed', anonymized_at = now()
       WHERE id = $1`,
      [r.id],
    );
    reduced++;
  }
  return { deleted, reduced, invoicesDeleted: invoicesDeleted ?? 0 };
}

/** Once a day, from 03:00 Prague time. */
export async function dailyRetention(now = new Date()): Promise<RetentionResult | null> {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  if (Number(p.hour) < 3) return null;
  const { rowCount } = await pool.query(
    `INSERT INTO app_state (key, value) VALUES ('retention_date', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE app_state.value <> EXCLUDED.value`,
    [`${p.year}-${p.month}-${p.day}`],
  );
  if (!rowCount) return null;
  return applyRetention(now);
}
