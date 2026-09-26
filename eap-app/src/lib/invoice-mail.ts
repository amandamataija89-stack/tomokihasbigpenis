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
 * Hourly: invoices whose due date has passed get one payment reminder to the client (with the QR code),
 * and the coordinator is told which ones. Returns how many were reminded.
 */
export async function remindOverdueInvoices(): Promise<number> {
  const { rows } = await pool.query<{ id: string; invoice_number: string; amount_czk: number; due_on: string }>(
    `SELECT id, invoice_number, amount_czk, to_char(due_on, 'YYYY-MM-DD') AS due_on FROM payments
     WHERE paid_on IS NULL AND invoice_number IS NOT NULL AND overdue_reminded_at IS NULL
       AND due_on < (now() AT TIME ZONE 'Europe/Prague')::date`,
  );
  const done: { firstName: string; number: string; amount: number; dueOn: string }[] = [];
  for (const r of rows) {
    // Claim it first so overlapping runs don't both send.
    const { rowCount } = await pool.query(
      "UPDATE payments SET overdue_reminded_at = now() WHERE id = $1 AND overdue_reminded_at IS NULL",
      [r.id],
    );
    if (!rowCount) continue;
    const who = await recipient(r.id);
    if (!who) continue;
    try {
      const data = await loadInvoice(r.id);
      const qr = data.qr ? (await qrPng(data.qr)).toString("base64") : undefined;
      await sendEmail(
        invoiceOverdueEmail(
          who.to,
          who.first_name,
          {
            number: data.number,
            amount: data.total,
            paid: false,
            dueOn: czDay(r.due_on),
            variableSymbol: data.variableSymbol,
            account: data.supplier.bankAccount,
            iban: data.supplier.iban,
          },
          qr,
        ),
      );
      await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
        who.request_id,
        `Invoice ${r.invoice_number} is overdue (due ${czDay(r.due_on)}). Payment reminder emailed to ${who.to}.`,
      ]);
      done.push({ firstName: who.first_name, number: r.invoice_number, amount: r.amount_czk, dueOn: czDay(r.due_on) });
    } catch (err) {
      console.error("EAP overdue reminder failed:", err);
    }
  }
  if (done.length) {
    const sent = await Promise.allSettled((await coordinatorEmails()).map((to) => sendEmail(overdueInvoicesAlert(to, done))));
    for (const s of sent) if (s.status === "rejected") console.error("EAP email failed:", s.reason);
  }
  return done.length;
}
