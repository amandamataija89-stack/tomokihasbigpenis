// A QR payment code for a single private session: the session's price and the client's variable symbol,
// so a payment is always recognised as that client's (and matched when the bank statement is uploaded).
import { ensureVariableSymbol, invoiceSettings, qrPlatba } from "./billing";
import { pool } from "./db";
import { qrPng } from "./invoice-pdf";

export type SessionPayment = {
  sessionId: string;
  requestId: string;
  startsAt: Date;
  amount: number; // CZK with VAT
  variableSymbol: string;
  account: string;
  iban: string;
  qr: string; // QR Platba text
};

const day = (d: Date) =>
  new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" }).format(d);

/** Payment details for a session that can be paid on its own: private, priced, not paid, not on an issued invoice. */
export async function sessionPayment(sessionId: string): Promise<SessionPayment | null> {
  const { rows } = await pool.query<{ request_id: string; starts_at: Date; price_czk: number | null }>(
    `SELECT cs.request_id, cs.starts_at, cs.price_czk FROM client_sessions cs
     JOIN support_requests r ON r.id = cs.request_id
     LEFT JOIN payments p ON p.id = cs.payment_id
     WHERE cs.id = $1 AND r.kind = 'private' AND cs.paid_at IS NULL AND cs.price_czk IS NOT NULL
       AND (cs.payment_id IS NULL OR p.invoice_number IS NULL)`,
    [sessionId],
  );
  const s = rows[0];
  if (!s) return null;
  const settings = await invoiceSettings();
  if (!settings.iban) return null;
  const vs = await ensureVariableSymbol(s.request_id);
  return {
    sessionId,
    requestId: s.request_id,
    startsAt: s.starts_at,
    amount: s.price_czk!,
    variableSymbol: vs,
    account: settings.bankAccount,
    iban: settings.iban,
    qr: qrPlatba({ iban: settings.iban, amountCzk: s.price_czk!, variableSymbol: vs, message: `Sezeni ${day(s.starts_at)}` }),
  };
}

export const sessionQrPng = async (p: SessionPayment) => qrPng(p.qr);

/** The client's sessions that can be paid now, oldest first, for their private page. */
export async function payableSessions(requestId: string): Promise<SessionPayment[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT cs.id FROM client_sessions cs LEFT JOIN payments p ON p.id = cs.payment_id
     WHERE cs.request_id = $1 AND cs.paid_at IS NULL AND cs.price_czk IS NOT NULL
       AND (cs.payment_id IS NULL OR p.invoice_number IS NULL)
     ORDER BY cs.starts_at`,
    [requestId],
  );
  const out: SessionPayment[] = [];
  for (const r of rows) {
    const p = await sessionPayment(r.id);
    if (p) out.push(p);
  }
  return out;
}
