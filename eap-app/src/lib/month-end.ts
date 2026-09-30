// End of the month: counsellors finish their admin (sessions marked, private clients' type and price) so
// the invoices made automatically on the 1st are right; the admin gets the month's invoices once sent.
import { pool } from "./db";
import { monthEndReminder, monthlyExportEmail, sendEmail } from "./email";
import { invoicesCsv, invoicesPdf, loadInvoices, monthPaymentIds } from "./invoice-export";
import { EMAIL_INVOICES_ON_DAY, previousMonth } from "./invoice-mail";

const prague = (now: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const year = Number(p.year);
  const month = Number(p.month);
  return { year, month, day: Number(p.day), daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(), ym: `${p.year}-${p.month}` };
};
/** "2026-09", +1 → "2026-10". */
export const shiftMonth = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

export const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

export type OpenAdmin = {
  pastUnmarked: { requestId: string; firstName: string; startsAt: Date }[];
  noType: { requestId: string; firstName: string }[];
  noPrice: { requestId: string; firstName: string }[];
  noConsent: { requestId: string; firstName: string }[]; // sessions booked but the consent form isn't signed
};

/** What a counsellor still has to do: past sessions not marked, and private clients without a type or price. */
export async function openAdmin(staffId: string, now = new Date()): Promise<OpenAdmin> {
  const [{ rows: past }, { rows: clients }] = await Promise.all([
    pool.query<{ request_id: string; first_name: string; starts_at: Date }>(
      `SELECT r.id AS request_id, r.first_name, cs.starts_at FROM client_sessions cs
       JOIN support_requests r ON r.id = cs.request_id
       WHERE r.assigned_to = $1 AND cs.done_at IS NULL AND cs.starts_at < $2 AND r.status <> 'closed'
       ORDER BY cs.starts_at`,
      [staffId, now],
    ),
    pool.query<{ id: string; first_name: string; service: string; session_price_czk: number | null; kind: string; unsigned: boolean }>(
      `SELECT r.id, r.first_name, r.service, r.session_price_czk, r.kind,
         EXISTS (SELECT 1 FROM client_sessions WHERE request_id = r.id)
           AND NOT EXISTS (SELECT 1 FROM consent_forms WHERE request_id = r.id) AS unsigned
       FROM support_requests r
       WHERE r.assigned_to = $1 AND r.status NOT IN ('completed', 'closed') AND r.accepted_at IS NOT NULL`,
      [staffId],
    ),
  ]);
  const privateClients = clients.filter((c) => c.kind === "private");
  return {
    pastUnmarked: past.map((p) => ({ requestId: p.request_id, firstName: p.first_name, startsAt: p.starts_at })),
    noType: privateClients.filter((c) => !c.service).map((c) => ({ requestId: c.id, firstName: c.first_name })),
    noPrice: privateClients.filter((c) => c.session_price_czk === null).map((c) => ({ requestId: c.id, firstName: c.first_name })),
    noConsent: privateClients.filter((c) => c.unsigned).map((c) => ({ requestId: c.id, firstName: c.first_name })),
  };
}

export type MonthSummary = { eapSessions: number; privateSessions: number; privateAmount: number; paidAmount: number };

/** A counsellor's month: sessions held (late cancellations included) and what their private clients owe for them. */
export async function counsellorMonth(staffId: string, ym: string): Promise<MonthSummary> {
  const { rows } = await pool.query<MonthSummary>(
    `SELECT
       count(*) FILTER (WHERE r.kind = 'eap')::int AS "eapSessions",
       count(*) FILTER (WHERE r.kind = 'private')::int AS "privateSessions",
       COALESCE(sum(cs.price_czk) FILTER (WHERE r.kind = 'private'), 0)::int AS "privateAmount",
       COALESCE(sum(cs.price_czk) FILTER (WHERE r.kind = 'private' AND cs.paid_at IS NOT NULL), 0)::int AS "paidAmount"
     FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
     WHERE r.assigned_to = $1 AND cs.done_at IS NOT NULL
       AND to_char(cs.starts_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $2`,
    [staffId, ym],
  );
  return rows[0];
}

export const currentMonth = (now = new Date()) => prague(now).ym;
/** The last day to finish the month's admin, e.g. "30 September". */
export const adminDeadline = (now = new Date()) => {
  const p = prague(now);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(p.year, p.month - 1, p.daysInMonth)),
  );
};

// Claims a once-only job (e.g. this month's reminder to one counsellor). Returns true the first time.
async function once(key: string): Promise<boolean> {
  const { rowCount } = await pool.query("INSERT INTO app_state (key, value) VALUES ($1, 'done') ON CONFLICT (key) DO NOTHING", [key]);
  return !!rowCount;
}

/** Hourly. In the last 3 days of the month, from 09:00: one reminder to each counsellor with admin left. */
export async function monthEndReminders(now = new Date()): Promise<number> {
  const p = prague(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Prague" }).format(now));
  if (p.day < p.daysInMonth - 2 || hour < 9) return 0;
  const { rows: staff } = await pool.query<{ id: string; name: string; email: string }>(
    "SELECT id, name, email FROM staff WHERE password_hash <> '!' AND (takes_clients OR role = 'counsellor')",
  );
  let sent = 0;
  for (const s of staff) {
    const open = await openAdmin(s.id, now);
    const items = {
      pastUnmarked: open.pastUnmarked.length,
      noType: open.noType.length,
      noPrice: open.noPrice.length,
      noConsent: open.noConsent.length,
    };
    if (!items.pastUnmarked && !items.noType && !items.noPrice && !items.noConsent) continue;
    if (!(await once(`month_end_reminder:${p.ym}:${s.id}`))) continue;
    try {
      await sendEmail(monthEndReminder(s.email, s.name, monthLabel(p.ym), items));
      sent++;
    } catch (err) {
      console.error("EAP month-end reminder failed:", err);
    }
  }
  return sent;
}

/** Hourly. Once last month's invoices have been emailed (from the 3rd), sends the admin the PDF and CSV. */
export async function sendMonthlyExport(now = new Date()): Promise<boolean> {
  if (prague(now).day < EMAIL_INVOICES_ON_DAY) return false;
  const month = previousMonth(now);
  const ids = await monthPaymentIds(month);
  if (!ids.length) return false;
  if (!(await once(`monthly_export:${month}`))) return false;
  const { rows: admins } = await pool.query<{ email: string }>("SELECT email FROM staff WHERE role = 'admin' AND password_hash <> '!'");
  const list = await loadInvoices(ids);
  const pdf = Buffer.from(await invoicesPdf(list)).toString("base64");
  const csv = Buffer.from(await invoicesCsv(list), "utf8").toString("base64");
  for (const a of admins)
    await sendEmail(monthlyExportEmail(a.email, monthLabel(month), ids.length, pdf, csv, month)).catch((err) =>
      console.error("EAP monthly export email failed:", err),
    );
  return true;
}
