// Billing for private clients: prices, payments (one or several sessions at once), prepaid
// packages, and the supplier details and numbering used on invoices.
import type { PoolClient } from "pg";
import { pool } from "./db";

type Queryable = Pick<PoolClient, "query">;

export const PAYMENT_METHODS = ["Bank transfer", "Cash", "Card"] as const;

// ---- Prices --------------------------------------------------------------------------

export type PriceRow = { service: string; price_czk: number | null };

export async function priceList(): Promise<PriceRow[]> {
  const { rows } = await pool.query<PriceRow>("SELECT service, price_czk FROM price_list ORDER BY service");
  return rows;
}

export async function setListPrice(service: string, price: number | null): Promise<void> {
  await pool.query(
    `INSERT INTO price_list (service, price_czk, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (service) DO UPDATE SET price_czk = EXCLUDED.price_czk, updated_at = now()`,
    [service, price],
  );
}

/**
 * The price a new session starts with: the client's own price, else the price list for their kind
 * of support, else what their last session cost. null when none of those is known.
 */
export async function defaultSessionPrice(requestId: string, db: Queryable = pool): Promise<number | null> {
  const { rows } = await db.query<{ price: number | null }>(
    `SELECT COALESCE(
       r.session_price_czk,
       (SELECT price_czk FROM price_list WHERE service = r.service),
       (SELECT price_czk FROM client_sessions WHERE request_id = r.id AND price_czk IS NOT NULL
        ORDER BY starts_at DESC LIMIT 1)
     ) AS price
     FROM support_requests r WHERE r.id = $1`,
    [requestId],
  );
  return rows[0]?.price ?? null;
}

/** A price typed in a form: whole CZK, null when empty, undefined when it isn't a number. */
export function parsePrice(raw: unknown): number | null | undefined {
  const s = String(raw ?? "").replace(/[\s,.]|CZK|Kč/gi, "");
  if (!s) return null;
  return /^\d{1,7}$/.test(s) ? Number(s) : undefined;
}

// ---- Billing details on the client's profile ------------------------------------------

export type BillingDetails = { name: string; address: string; ico: string; dic: string; email: string };

export function billingFrom(form: FormData): BillingDetails {
  const t = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  return {
    name: t("billingName", 200),
    address: t("billingAddress", 500),
    ico: t("billingIco", 20),
    dic: t("billingDic", 20),
    email: t("billingEmail", 200).toLowerCase(),
  };
}

// ---- Payments and packages -------------------------------------------------------------

export type Payment = {
  id: string;
  amount_czk: number;
  paid_on: string; // YYYY-MM-DD
  method: string;
  invoice_number: string | null;
  invoiced_at: Date | null;
  created_at: Date;
  package_sessions: number | null; // set when the payment bought a package
  session_ids: string[];
};

export async function listPayments(requestId: string): Promise<Payment[]> {
  const { rows } = await pool.query<Payment>(
    `SELECT p.id, p.amount_czk, to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on, p.method, p.invoice_number,
       p.invoiced_at, p.created_at,
       (SELECT sessions FROM packages WHERE payment_id = p.id LIMIT 1) AS package_sessions,
       COALESCE((SELECT array_agg(id ORDER BY starts_at) FROM client_sessions WHERE payment_id = p.id), '{}') AS session_ids
     FROM payments p WHERE p.request_id = $1 ORDER BY p.paid_on DESC, p.created_at DESC`,
    [requestId],
  );
  return rows;
}

export type PackageState = { id: string; sessions: number; used: number; price_czk: number };

export async function listPackages(requestId: string): Promise<PackageState[]> {
  const { rows } = await pool.query<PackageState>(
    `SELECT k.id, k.sessions, k.price_czk,
       (SELECT count(*)::int FROM client_sessions WHERE package_id = k.id) AS used
     FROM packages k WHERE k.request_id = $1 ORDER BY k.created_at`,
    [requestId],
  );
  return rows;
}

async function inTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  } finally {
    c.release();
  }
}

export type NewPayment = {
  requestId: string;
  sessionIds: string[];
  amount: number | null; // null: the sum of the sessions' prices
  paidOn: string; // YYYY-MM-DD
  method: string;
  invoiceNumber: string | null;
  staffId: string;
};

/** Records one payment for one or more of the client's unpaid sessions. Returns the amount, or null if nothing to pay. */
export function recordPayment(p: NewPayment): Promise<number | null> {
  return inTransaction(async (c) => {
    // Only this client's sessions that aren't paid yet.
    const { rows: sessions } = await c.query<{ id: string; price_czk: number | null }>(
      `SELECT id, price_czk FROM client_sessions
       WHERE request_id = $1 AND id = ANY($2::uuid[]) AND paid_at IS NULL FOR UPDATE`,
      [p.requestId, p.sessionIds],
    );
    if (!sessions.length) return null;
    const amount = p.amount ?? sessions.reduce((sum, s) => sum + (s.price_czk ?? 0), 0);
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO payments (request_id, amount_czk, paid_on, method, invoice_number, staff_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [p.requestId, amount, p.paidOn, p.method, p.invoiceNumber, p.staffId],
    );
    await c.query(
      "UPDATE client_sessions SET payment_id = $2, paid_at = $3::date WHERE id = ANY($1::uuid[])",
      [sessions.map((s) => s.id), rows[0].id, p.paidOn],
    );
    return amount;
  });
}

/**
 * Records a prepaid package. Sessions already booked and not yet paid are taken from it first
 * (oldest first); later bookings use what's left. Returns how many existing sessions it covered.
 */
export function recordPackage(p: {
  requestId: string;
  sessions: number;
  price: number;
  paidOn: string;
  method: string;
  invoiceNumber: string | null;
  staffId: string;
}): Promise<number> {
  return inTransaction(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO payments (request_id, amount_czk, paid_on, method, invoice_number, staff_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [p.requestId, p.price, p.paidOn, p.method, p.invoiceNumber, p.staffId],
    );
    const { rows: pkg } = await c.query<{ id: string }>(
      "INSERT INTO packages (request_id, sessions, price_czk, payment_id) VALUES ($1, $2, $3, $4) RETURNING id",
      [p.requestId, p.sessions, p.price, rows[0].id],
    );
    const { rowCount } = await c.query(
      `UPDATE client_sessions SET package_id = $2, paid_at = $3::date
       WHERE id IN (SELECT id FROM client_sessions WHERE request_id = $1 AND paid_at IS NULL
                    ORDER BY starts_at LIMIT $4)`,
      [p.requestId, pkg[0].id, p.paidOn, p.sessions],
    );
    return rowCount ?? 0;
  });
}

/** A newly booked session uses the client's oldest package with sessions left, if any. Returns true if it did. */
export async function useFromPackage(requestId: string, sessionId: string, db: Queryable = pool): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE client_sessions cs SET package_id = k.id, paid_at = p.paid_on
     FROM packages k JOIN payments p ON p.id = k.payment_id
     WHERE cs.id = $2 AND cs.paid_at IS NULL AND k.id = (
       SELECT k2.id FROM packages k2
       WHERE k2.request_id = $1
         AND (SELECT count(*) FROM client_sessions WHERE package_id = k2.id) < k2.sessions
       ORDER BY k2.created_at LIMIT 1)`,
    [requestId, sessionId],
  );
  return !!rowCount;
}

/** Marks one session as no longer paid. A payment left covering nothing (and not invoiced) is deleted. */
export async function unpaySession(sessionId: string): Promise<void> {
  await inTransaction(async (c) => {
    const { rows } = await c.query<{ payment_id: string | null }>(
      "SELECT payment_id FROM client_sessions WHERE id = $1 FOR UPDATE",
      [sessionId],
    );
    await c.query("UPDATE client_sessions SET paid_at = NULL, payment_id = NULL, package_id = NULL WHERE id = $1", [
      sessionId,
    ]);
    const pid = rows[0]?.payment_id;
    if (pid)
      await c.query(
        `DELETE FROM payments p WHERE p.id = $1 AND p.invoice_number IS NULL
           AND NOT EXISTS (SELECT 1 FROM client_sessions WHERE payment_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM packages WHERE payment_id = p.id)`,
        [pid],
      );
  });
}

/** Deletes a payment (and a package it bought); the sessions it paid for become unpaid again. */
export async function deletePayment(requestId: string, paymentId: string): Promise<boolean> {
  return inTransaction(async (c) => {
    await c.query(
      `UPDATE client_sessions SET paid_at = NULL, payment_id = NULL, package_id = NULL
       WHERE request_id = $1 AND (payment_id = $2 OR package_id IN (SELECT id FROM packages WHERE payment_id = $2))`,
      [requestId, paymentId],
    );
    const { rowCount } = await c.query("DELETE FROM payments WHERE id = $1 AND request_id = $2", [paymentId, requestId]);
    return !!rowCount;
  });
}

// ---- Invoice settings and numbering ------------------------------------------------------

export type InvoiceSettings = {
  supplierName: string;
  supplierAddress: string;
  ico: string;
  dic: string;
  note: string; // printed at the bottom, e.g. the VAT status
  bankAccount: string; // Czech format, e.g. 123456789/0800
  iban: string;
  registration: string; // e.g. "Registered in the Commercial Register kept by the Municipal Court in Prague, section C, file 12345"
  email: string;
  phone: string;
  nextNumber: string; // e.g. 2026001; the digits at the end go up by one for each invoice
  dueDays: number;
};

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  supplierName: "Prague Integration s.r.o.",
  supplierAddress: "Mezibranská 4\n110 00 Praha 1",
  ico: "",
  dic: "",
  note: "Nejsme plátci DPH. / Not a VAT payer.",
  bankAccount: "",
  iban: "",
  registration: "",
  email: "contact@pragueintegration.cz",
  phone: "+420 608 573 256",
  nextNumber: `${new Date().getFullYear()}001`,
  dueDays: 14,
};

export async function invoiceSettings(db: Queryable = pool): Promise<InvoiceSettings> {
  const { rows } = await db.query<{ value: string }>("SELECT value FROM app_state WHERE key = 'invoice_settings'");
  if (!rows[0]) return DEFAULT_INVOICE_SETTINGS;
  try {
    return { ...DEFAULT_INVOICE_SETTINGS, ...JSON.parse(rows[0].value) };
  } catch {
    return DEFAULT_INVOICE_SETTINGS;
  }
}

export async function saveInvoiceSettings(s: InvoiceSettings): Promise<void> {
  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ('invoice_settings', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(s)],
  );
}

/** The number after `n`: the digits at its end go up by one, keeping their width ("2026009" → "2026010"). */
export function nextInvoiceNumber(n: string): string {
  const m = n.match(/^(.*?)(\d+)$/);
  if (!m) return `${n}-2`;
  const next = String(Number(m[2]) + 1).padStart(m[2].length, "0");
  return m[1] + next;
}

/**
 * Gives a payment its invoice number (the next in the sequence, unless it already has one typed in)
 * and marks it invoiced. Returns the number.
 */
export function issueInvoice(paymentId: string): Promise<string> {
  return inTransaction(async (c) => {
    const { rows } = await c.query<{ invoice_number: string | null }>(
      "SELECT invoice_number FROM payments WHERE id = $1 FOR UPDATE",
      [paymentId],
    );
    if (!rows[0]) throw new Error("Payment not found");
    let number = rows[0].invoice_number;
    if (!number) {
      // Lock the settings row so two invoices can't get the same number.
      await c.query("SELECT 1 FROM app_state WHERE key = 'invoice_settings' FOR UPDATE");
      const settings = await invoiceSettings(c);
      number = settings.nextNumber;
      // Skip numbers already typed in by hand.
      while ((await c.query("SELECT 1 FROM payments WHERE invoice_number = $1", [number])).rowCount)
        number = nextInvoiceNumber(number);
      await c.query(
        `INSERT INTO app_state (key, value) VALUES ('invoice_settings', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify({ ...settings, nextNumber: nextInvoiceNumber(number) })],
      );
    }
    await c.query(
      "UPDATE payments SET invoice_number = $2, invoiced_at = COALESCE(invoiced_at, now()) WHERE id = $1",
      [paymentId, number],
    );
    return number;
  });
}
