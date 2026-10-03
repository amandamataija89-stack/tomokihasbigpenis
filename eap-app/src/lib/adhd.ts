// ADHD testing: when the client is assigned, they're emailed how testing works and a deposit invoice
// (3 000 CZK). When the testing session is marked done, a final invoice is issued for the rest: the
// session's price less the deposit.
import { discounted, ensureVariableSymbol, invoiceSettings, issueInvoice, priceList, qrPlatba, recomputeInvoice, STUDENT_DISCOUNT_PERCENT, withVat } from "./billing";
import { pool } from "./db";

export const ADHD_SERVICE = "ADHD testing";
export const ADHD_DEPOSIT_CZK = 3000; // with VAT
export const ADHD_DEFAULT_NET_CZK = 7000;
const DEPOSIT_DAYS = 2; // pay within 48 hours

const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(d);

/** The full testing fee with VAT (and the student discount if they have it). */
export async function adhdTotal(requestId: string): Promise<{ total: number; net: number; student: boolean }> {
  const { rows } = await pool.query<{ price: number | null; net: number | null; student: boolean }>(
    "SELECT session_price_czk AS price, session_price_net_czk AS net, student_discount AS student FROM support_requests WHERE id = $1",
    [requestId],
  );
  const r = rows[0];
  const settings = await invoiceSettings();
  const listNet = (await priceList()).find((p) => p.service === ADHD_SERVICE)?.min_net_czk ?? ADHD_DEFAULT_NET_CZK;
  const net = discounted(r?.net ?? listNet, !!r?.student);
  return { total: r?.price ?? withVat(net, settings), net, student: !!r?.student };
}

/**
 * Once an ADHD testing client has a counsellor (assigned and accepted): the info email and the deposit
 * invoice, once only. Safe to call from anywhere; it does nothing for other clients.
 */
export async function maybeStartAdhdTesting(requestId: string): Promise<boolean> {
  const { rows } = await pool.query<{ email: string; first_name: string; counsellor: string; email_ok: boolean }>(
    `UPDATE support_requests r SET adhd_info_sent_at = now()
     FROM staff s
     WHERE r.id = $1 AND s.id = r.assigned_to AND r.kind = 'private' AND r.service = $2
       AND r.accepted_at IS NOT NULL AND r.adhd_info_sent_at IS NULL
       AND NOT r.consent_on_file -- existing clients from the previous system are already in the process
     RETURNING r.email, r.first_name, s.name AS counsellor, true AS email_ok`,
    [requestId, ADHD_SERVICE],
  );
  const r = rows[0];
  if (!r) return false;
  const { total, student } = await adhdTotal(requestId);
  const settings = await invoiceSettings();
  const vs = await ensureVariableSymbol(requestId);

  // The deposit invoice: one line, due in 48 hours.
  const { rows: made } = await pool.query<{ id: string }>(
    `INSERT INTO payments (request_id, amount_czk, paid_on, method, due_on) VALUES ($1, $2, NULL, 'Bank transfer', $3::date) RETURNING id`,
    [requestId, ADHD_DEPOSIT_CZK, day(new Date(Date.now() + DEPOSIT_DAYS * 86_400_000))],
  );
  const depositId = made[0].id;
  await pool.query("INSERT INTO invoice_items (payment_id, description, amount_czk) VALUES ($1, $2, $3)", [
    depositId,
    "ADHD testing – deposit",
    ADHD_DEPOSIT_CZK,
  ]);
  await recomputeInvoice(depositId);
  const number = await issueInvoice(depositId);
  await pool.query("UPDATE support_requests SET adhd_deposit_payment_id = $2 WHERE id = $1", [requestId, depositId]);

  const { qrPng } = await import("./invoice-pdf");
  const { adhdTestingEmail, sendEmail } = await import("./email");
  const { clientMessageLink } = await import("./messages");
  const { sendInvoice } = await import("./invoice-mail");
  const qr = settings.iban
    ? (await qrPng(qrPlatba({ iban: settings.iban, amountCzk: ADHD_DEPOSIT_CZK, variableSymbol: vs, message: "ADHD testovani zaloha" }))).toString("base64")
    : undefined;
  await sendEmail(
    adhdTestingEmail(r.email, r.first_name, {
      psychologist: r.counsellor.split(" ")[0],
      total,
      deposit: ADHD_DEPOSIT_CZK,
      student,
      studentPercent: STUDENT_DISCOUNT_PERCENT,
      account: settings.bankAccount,
      iban: settings.iban,
      variableSymbol: vs,
      messageLink: await clientMessageLink(requestId),
      qrPngBase64: qr,
    }),
  );
  await sendInvoice(depositId).catch((err) => console.error("EAP ADHD deposit invoice email failed:", err));
  await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
    requestId,
    `ADHD testing information emailed to the client, with deposit invoice ${number} (${ADHD_DEPOSIT_CZK} CZK, due in 48 hours).`,
  ]);
  return true;
}

/**
 * The testing session was held: the final invoice for the rest (the session less the deposit), issued and
 * emailed. Returns its id, or null if this isn't an ADHD testing client with a deposit invoice.
 */
export async function adhdFinalInvoice(sessionId: string): Promise<string | null> {
  const { rows } = await pool.query<{ request_id: string; deposit_id: string; deposit_number: string | null }>(
    `SELECT r.id AS request_id, r.adhd_deposit_payment_id AS deposit_id, p.invoice_number AS deposit_number
     FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
     JOIN payments p ON p.id = r.adhd_deposit_payment_id
     WHERE cs.id = $1 AND r.service = $2 AND NOT cs.is_discovery AND cs.paid_at IS NULL AND cs.payment_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM invoice_items i WHERE i.description LIKE 'Less deposit%' AND i.payment_id IN
         (SELECT id FROM payments WHERE request_id = r.id))`,
    [sessionId, ADHD_SERVICE],
  );
  const s = rows[0];
  if (!s) return null;
  const { createInvoiceToPay, addInvoiceItem } = await import("./billing");
  const id = await createInvoiceToPay({ requestId: s.request_id, sessionIds: [sessionId], amount: null, staffId: null, issue: false });
  if (!id) return null;
  await addInvoiceItem(id, `Less deposit (invoice ${s.deposit_number ?? ""})`.trim(), -ADHD_DEPOSIT_CZK);
  await pool.query("UPDATE payments SET due_on = $2::date WHERE id = $1", [id, day(new Date())]);
  const number = await issueInvoice(id);
  const { sendInvoice } = await import("./invoice-mail");
  await sendInvoice(id).catch((err) => console.error("EAP ADHD final invoice email failed:", err));
  await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
    s.request_id,
    `ADHD testing held: final invoice ${number} issued (the session less the ${ADHD_DEPOSIT_CZK} CZK deposit) and emailed to the client.`,
  ]);
  return id;
}
