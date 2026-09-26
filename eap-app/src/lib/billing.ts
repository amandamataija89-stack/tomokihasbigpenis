// Billing for private clients: prices, payments (one or several sessions at once), prepaid
// packages, and the supplier details and numbering used on invoices.
import type { PoolClient } from "pg";
import { pool } from "./db";

type Queryable = Pick<PoolClient, "query">;

export const PAYMENT_METHODS = ["Bank transfer", "Cash", "Card"] as const;

// ---- Prices --------------------------------------------------------------------------

// Prices on the price list are ranges without VAT; the counsellor picks each client's price from it,
// in steps of PRICE_STEP. Sessions and payments store the price with VAT (what the client pays).
export const PRICE_STEP = 100;

export type PriceRow = { service: string; min_net_czk: number | null; max_net_czk: number | null };

export async function priceList(): Promise<PriceRow[]> {
  const { rows } = await pool.query<PriceRow>("SELECT service, min_net_czk, max_net_czk FROM price_list ORDER BY service");
  return rows;
}

export async function setPriceRange(service: string, min: number | null, max: number | null): Promise<void> {
  await pool.query(
    `INSERT INTO price_list (service, min_net_czk, max_net_czk, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (service) DO UPDATE SET min_net_czk = EXCLUDED.min_net_czk, max_net_czk = EXCLUDED.max_net_czk, updated_at = now()`,
    [service, min, max],
  );
}

/** The prices a counsellor can pick from a range, e.g. 900, 1000, … 2300. */
export function priceSteps(min: number, max: number, step = PRICE_STEP): number[] {
  if (max < min) return [];
  const out: number[] = [];
  for (let p = min; p <= max; p += step) out.push(p);
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

/** The price with VAT for a price without VAT (unchanged when not a VAT payer). Whole crowns. */
export const withVat = (net: number, s: Pick<InvoiceSettings, "vatPayer" | "vatRate">) =>
  s.vatPayer ? Math.round((net * (100 + s.vatRate)) / 100) : net;

/**
 * The price (with VAT) a new session starts with: the client's price chosen by their counsellor, else the
 * list price when their kind of support has a single price, else what their last session cost.
 */
export async function defaultSessionPrice(requestId: string, db: Queryable = pool): Promise<number | null> {
  const { rows } = await db.query<{ own: number | null; min: number | null; max: number | null; last: number | null }>(
    `SELECT r.session_price_czk AS own, l.min_net_czk AS min, l.max_net_czk AS max,
       (SELECT price_czk FROM client_sessions WHERE request_id = r.id AND price_czk IS NOT NULL
        ORDER BY starts_at DESC LIMIT 1) AS last
     FROM support_requests r LEFT JOIN price_list l ON l.service = r.service WHERE r.id = $1`,
    [requestId],
  );
  const r = rows[0];
  if (!r) return null;
  if (r.own !== null) return r.own;
  if (r.min !== null && r.min === r.max) return withVat(r.min, await invoiceSettings(db));
  return r.last;
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

/**
 * A payment received, or an invoice issued and awaiting payment (paid_on null, due_on set).
 * Sessions on an unpaid invoice have payment_id set but paid_at still null.
 */
export type Payment = {
  id: string;
  amount_czk: number;
  paid_on: string | null; // YYYY-MM-DD; null while the invoice is unpaid
  due_on: string | null; // YYYY-MM-DD
  period: string | null; // 'YYYY-MM' for a monthly invoice
  emailed_at: Date | null;
  overdue_reminded_at: Date | null;
  method: string;
  invoice_number: string | null;
  invoiced_at: Date | null;
  created_at: Date;
  package_sessions: number | null; // set when the payment bought a package
  session_ids: string[];
};

export async function listPayments(requestId: string): Promise<Payment[]> {
  const { rows } = await pool.query<Payment>(
    `SELECT p.id, p.amount_czk, to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on, to_char(p.due_on, 'YYYY-MM-DD') AS due_on,
       p.period, p.emailed_at, p.overdue_reminded_at, p.method, p.invoice_number, p.invoiced_at, p.created_at,
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
       WHERE request_id = $1 AND id = ANY($2::uuid[]) AND paid_at IS NULL AND payment_id IS NULL FOR UPDATE`,
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
       WHERE id IN (SELECT id FROM client_sessions WHERE request_id = $1 AND paid_at IS NULL AND payment_id IS NULL
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
     WHERE cs.id = $2 AND cs.paid_at IS NULL AND cs.payment_id IS NULL AND k.id = (
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
  vatPayer: boolean; // invoices are tax documents (daňový doklad) with VAT shown
  vatRate: number; // percent; prices entered include VAT
  note: string; // printed at the bottom
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
  supplierAddress: "Olšanská 4E\n130 00 Praha 3",
  ico: "21048428",
  dic: "CZ21048428",
  vatPayer: true,
  vatRate: 21,
  note: "",
  bankAccount: "5454387003/5500",
  iban: "CZ4555000000005454387003",
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

/**
 * Splits a price that includes VAT into base and VAT, in haléře (hundredths of a crown), the way
 * Czech VAT law computes it from a gross price: VAT = price × rate / (100 + rate), rounded.
 */
export function vatSplit(grossCzk: number, ratePercent: number): { base: number; vat: number; gross: number } {
  const gross = Math.round(grossCzk * 100);
  const vat = Math.round((gross * ratePercent) / (100 + ratePercent));
  return { base: gross - vat, vat, gross };
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
    const { dueDays } = await invoiceSettings(c);
    // An invoice to pay is due dueDays (14) after it's issued.
    await c.query(
      `UPDATE payments SET invoice_number = $2, invoiced_at = COALESCE(invoiced_at, now()),
         due_on = CASE WHEN paid_on IS NULL THEN COALESCE(due_on, (now() AT TIME ZONE 'Europe/Prague')::date + $3::int) END
       WHERE id = $1`,
      [paymentId, number, dueDays],
    );
    return number;
  });
}

// ---- Invoices to pay later ---------------------------------------------------------------

/** The client's variable symbol, given one if they don't have it yet. */
export async function ensureVariableSymbol(requestId: string, db: Queryable = pool): Promise<string> {
  const { rows } = await db.query<{ variable_symbol: string }>(
    `UPDATE support_requests SET variable_symbol = COALESCE(variable_symbol, nextval('client_vs_seq')::text)
     WHERE id = $1 RETURNING variable_symbol`,
    [requestId],
  );
  return rows[0].variable_symbol;
}

/**
 * Issues an invoice to pay for sessions that are neither paid nor on another invoice. It gets its
 * number now and is due 14 days from today. Returns its id, or null if there was nothing to invoice.
 */
export async function createInvoiceToPay(p: {
  requestId: string;
  sessionIds: string[];
  amount: number | null;
  staffId: string | null;
  period?: string;
}): Promise<string | null> {
  const id = await inTransaction(async (c) => {
    const { rows: sessions } = await c.query<{ id: string; price_czk: number | null }>(
      `SELECT id, price_czk FROM client_sessions
       WHERE request_id = $1 AND id = ANY($2::uuid[]) AND paid_at IS NULL AND payment_id IS NULL FOR UPDATE`,
      [p.requestId, p.sessionIds],
    );
    if (!sessions.length) return null;
    const amount = p.amount ?? sessions.reduce((sum, s) => sum + (s.price_czk ?? 0), 0);
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO payments (request_id, amount_czk, paid_on, method, period, staff_id)
       VALUES ($1, $2, NULL, 'Bank transfer', $3, $4) RETURNING id`,
      [p.requestId, amount, p.period ?? null, p.staffId],
    );
    await c.query("UPDATE client_sessions SET payment_id = $2 WHERE id = ANY($1::uuid[])", [
      sessions.map((s) => s.id),
      rows[0].id,
    ]);
    await ensureVariableSymbol(p.requestId, c);
    return rows[0].id;
  });
  if (id) await issueInvoice(id);
  return id;
}

/** Records that an invoice was paid: its sessions become paid on that date. */
export async function markInvoicePaid(requestId: string, paymentId: string, paidOn: string, method: string): Promise<boolean> {
  return inTransaction(async (c) => {
    const { rowCount } = await c.query(
      "UPDATE payments SET paid_on = $3, method = $4 WHERE id = $1 AND request_id = $2 AND paid_on IS NULL",
      [paymentId, requestId, paidOn, method],
    );
    if (!rowCount) return false;
    await c.query("UPDATE client_sessions SET paid_at = $2::date WHERE payment_id = $1", [paymentId, paidOn]);
    return true;
  });
}

export type MonthlyInvoiceResult = { requestId: string; firstName: string; paymentId: string; sessions: number; amount: number };

/**
 * One invoice per private client for the sessions held in `month` (late cancellations included)
 * that aren't paid or invoiced yet. Sessions without a price are left out and reported.
 */
export async function createMonthlyInvoices(
  month: string,
  staffId: string,
): Promise<{ created: MonthlyInvoiceResult[]; withoutPrice: { requestId: string; firstName: string; sessions: number }[] }> {
  const { rows } = await pool.query<{ request_id: string; first_name: string; ids: string[]; no_price: number }>(
    `SELECT r.id AS request_id, r.first_name,
       COALESCE(array_agg(cs.id ORDER BY cs.starts_at) FILTER (WHERE cs.price_czk IS NOT NULL), '{}') AS ids,
       count(*) FILTER (WHERE cs.price_czk IS NULL)::int AS no_price
     FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
     WHERE r.kind = 'private' AND cs.done_at IS NOT NULL AND cs.paid_at IS NULL AND cs.payment_id IS NULL
       AND to_char(cs.starts_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $1
     GROUP BY r.id ORDER BY r.first_name`,
    [month],
  );
  const created: MonthlyInvoiceResult[] = [];
  for (const r of rows) {
    if (!r.ids.length) continue;
    const paymentId = await createInvoiceToPay({ requestId: r.request_id, sessionIds: r.ids, amount: null, staffId, period: month });
    if (!paymentId) continue;
    const { rows: p } = await pool.query<{ amount_czk: number }>("SELECT amount_czk FROM payments WHERE id = $1", [paymentId]);
    created.push({ requestId: r.request_id, firstName: r.first_name, paymentId, sessions: r.ids.length, amount: p[0].amount_czk });
  }
  return {
    created,
    withoutPrice: rows.filter((r) => r.no_price > 0).map((r) => ({ requestId: r.request_id, firstName: r.first_name, sessions: r.no_price })),
  };
}

export type OpenInvoice = {
  id: string;
  request_id: string;
  first_name: string;
  invoice_number: string;
  amount_czk: number;
  due_on: string;
  overdue: boolean;
};

/** Invoices issued and not yet paid, overdue first. */
export async function openInvoices(): Promise<OpenInvoice[]> {
  const { rows } = await pool.query<OpenInvoice>(
    `SELECT p.id, p.request_id, r.first_name, p.invoice_number, p.amount_czk, to_char(p.due_on, 'YYYY-MM-DD') AS due_on,
       p.due_on < (now() AT TIME ZONE 'Europe/Prague')::date AS overdue
     FROM payments p JOIN support_requests r ON r.id = p.request_id
     WHERE p.paid_on IS NULL AND p.invoice_number IS NOT NULL
     ORDER BY p.due_on, p.invoice_number`,
  );
  return rows;
}

/** The Czech QR Platba (Short Payment Descriptor) text for paying an invoice. */
export function qrPlatba(p: { iban: string; amountCzk: number; variableSymbol: string; message: string }): string {
  const clean = (t: string) => t.replace(/\*/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 60);
  return [
    "SPD*1.0",
    `ACC:${p.iban.replace(/\s+/g, "").toUpperCase()}`,
    `AM:${p.amountCzk.toFixed(2)}`,
    "CC:CZK",
    `X-VS:${p.variableSymbol.replace(/\D/g, "").slice(0, 10)}`,
    `MSG:${clean(p.message)}`,
  ].join("*");
}
