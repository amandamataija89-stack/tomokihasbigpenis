// Emailing invoices (with the QR code for ones to pay) and the late-payment reminders.
import { pool } from "./db";
import { invoiceOverdueEmail, invoiceEmail, overdueInvoicesAlert, sendEmail, type InvoiceEmailInfo } from "./email";
import { invoiceFileName, loadInvoice, qrPng, renderInvoice } from "./invoice-pdf";
import { coordinatorEmails } from "./offers";

const czDay = (iso: string) =>
  new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

async function recipient(paymentId: string) {
  const { rows } = await pool.query<{ to: string; first_name: string; request_id: string }>(
    `SELECT COALESCE(NULLIF(r.billing_email, ''), r.email) AS to, r.first_name, r.id AS request_id
     FROM payments p JOIN support_requests r ON r.id = p.request_id WHERE p.id = $1`,
    [paymentId],
  );
  return rows[0] ?? null;
}

/** Emails a payment's invoice PDF (plus the QR code if it's still to pay). Returns the number and address. */
export async function sendInvoice(paymentId: string): Promise<{ number: string; to: string }> {
  const who = await recipient(paymentId);
  if (!who) throw new Error("Payment not found");
  const data = await loadInvoice(paymentId);
  const pdf = await renderInvoice(data);
  const info: InvoiceEmailInfo = {
    number: data.number,
    amount: data.total,
    paid: data.paidOn !== null,
    dueOn: data.dueOn ? czDay(data.dueOn) : null,
    variableSymbol: data.variableSymbol,
    account: data.supplier.bankAccount,
    iban: data.supplier.iban,
  };
  const qr = data.qr ? (await qrPng(data.qr)).toString("base64") : undefined;
  await sendEmail(invoiceEmail(who.to, who.first_name, info, Buffer.from(pdf).toString("base64"), invoiceFileName(data.number), qr));
  await pool.query("UPDATE payments SET emailed_at = now() WHERE id = $1", [paymentId]);
  await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
    who.request_id,
    `Invoice ${data.number} emailed to ${who.to}.`,
  ]);
  return { number: data.number, to: who.to };
}

/**
 * Hourly: tells the coordinator about invoices whose due date has just passed without being marked paid,
 * so they can check the bank statement. Only after that check does the coordinator send the client a
 * reminder (sendPaymentReminder). Returns how many invoices became overdue.
 */
export async function alertOverdueInvoices(): Promise<number> {
  const { rows } = await pool.query<{ id: string; invoice_number: string; amount_czk: number; due_on: string; first_name: string }>(
    `UPDATE payments p SET overdue_reminded_at = now()
     FROM support_requests r
     WHERE r.id = p.request_id AND p.paid_on IS NULL AND p.invoice_number IS NOT NULL AND p.overdue_reminded_at IS NULL
       AND p.due_on < (now() AT TIME ZONE 'Europe/Prague')::date
     RETURNING p.id, p.invoice_number, p.amount_czk, to_char(p.due_on, 'YYYY-MM-DD') AS due_on, r.first_name`,
  );
  if (rows.length) {
    const list = rows.map((r) => ({ firstName: r.first_name, number: r.invoice_number, amount: r.amount_czk, dueOn: czDay(r.due_on) }));
    const sent = await Promise.allSettled((await coordinatorEmails()).map((to) => sendEmail(overdueInvoicesAlert(to, list))));
    for (const s of sent) if (s.status === "rejected") console.error("EAP email failed:", s.reason);
  }
  return rows.length;
}

/** The coordinator, having checked the bank statement, emails the client a payment reminder with the QR code. */
export async function sendPaymentReminder(paymentId: string): Promise<{ number: string; to: string }> {
  const who = await recipient(paymentId);
  if (!who) throw new Error("Payment not found");
  const data = await loadInvoice(paymentId);
  if (data.paidOn) throw new Error("This invoice is already paid.");
  const qr = data.qr ? (await qrPng(data.qr)).toString("base64") : undefined;
  await sendEmail(
    invoiceOverdueEmail(
      who.to,
      who.first_name,
      {
        number: data.number,
        amount: data.total,
        paid: false,
        dueOn: data.dueOn ? czDay(data.dueOn) : null,
        variableSymbol: data.variableSymbol,
        account: data.supplier.bankAccount,
        iban: data.supplier.iban,
      },
      qr,
    ),
  );
  await pool.query("UPDATE payments SET client_reminded_at = now() WHERE id = $1", [paymentId]);
  await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
    who.request_id,
    `Payment reminder for invoice ${data.number} emailed to ${who.to}.`,
  ]);
  return { number: data.number, to: who.to };
}

const pragueParts = (now: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
};

/** Last month as 'YYYY-MM', in Prague time. */
export function previousMonth(now = new Date()): string {
  const { year, month } = pragueParts(now);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

export const EMAIL_INVOICES_ON_DAY = 3;

/**
 * Hourly. From the 1st: last month's invoices are created (and sessions marked held later are added to
 * them). From the 3rd: monthly invoices not emailed yet (new, or updated since they were sent) are
 * emailed to the clients, so the coordinator has two days to check them.
 */
export async function autoMonthlyInvoices(now = new Date()): Promise<{ created: number; emailed: number }> {
  const month = previousMonth(now);
  // Automatic invoicing starts with the month it was switched on (the first run records it), so turning
  // it on never invoices or emails clients for earlier months.
  await pool.query(
    "INSERT INTO app_state (key, value) VALUES ('auto_invoicing_since', $1) ON CONFLICT (key) DO NOTHING",
    [pragueParts(now).year + "-" + String(pragueParts(now).month).padStart(2, "0")],
  );
  const { rows: since } = await pool.query<{ value: string }>("SELECT value FROM app_state WHERE key = 'auto_invoicing_since'");
  if (month < since[0].value) return { created: 0, emailed: 0 };
  const { createMonthlyInvoices } = await import("./billing");
  const { created, updated } = await createMonthlyInvoices(month, null);
  for (const c of created)
    await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
      c.requestId,
      `Monthly invoice for ${month} created automatically: ${c.sessions} session${c.sessions === 1 ? "" : "s"}, ${c.amount.toLocaleString("cs-CZ")} CZK.`,
    ]);
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM payments
     WHERE period IS NOT NULL AND paid_on IS NULL AND emailed_at IS NULL AND invoice_number IS NOT NULL
       AND period >= $3 AND (period < $1 OR (period = $1 AND $2))`,
    [month, pragueParts(now).day >= EMAIL_INVOICES_ON_DAY, since[0].value],
  );
  let emailed = 0;
  for (const r of rows) {
    try {
      await sendInvoice(r.id);
      emailed++;
    } catch (err) {
      console.error("EAP invoice email failed:", err);
    }
  }
  return { created: created.length + updated.length, emailed };
}
