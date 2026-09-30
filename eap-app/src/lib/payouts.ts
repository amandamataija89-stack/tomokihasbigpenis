// Counsellor payouts for a month: their share of the private sessions they held (fees without VAT, late
// cancellations included) plus a fixed fee per EAP session held. Discovery sessions are free: no payout.
import { invoiceSettings } from "./billing";
import { pool } from "./db";

export type PayoutLine = {
  starts_at: Date;
  first_name: string;
  kind: "eap" | "private";
  late_cancelled: boolean;
  gross: number; // what the client pays, with VAT (0 for EAP)
  net: number; // without VAT
  paid: boolean;
  payout: number;
};

export type Payout = {
  staff_id: string;
  name: string;
  percent: number;
  eap_fee: number;
  eap_sessions: number;
  private_sessions: number;
  private_net: number;
  private_net_paid: number;
  payout: number;
  lines: PayoutLine[];
};

export async function monthPayouts(ym: string, onlyStaff: string | null = null): Promise<Payout[]> {
  const settings = await invoiceSettings();
  const toNet = (gross: number) => (settings.vatPayer ? Math.round((gross * 100) / (100 + settings.vatRate)) : gross);
  const { rows: staff } = await pool.query<{ id: string; name: string; payout_percent: number; eap_session_fee: number }>(
    `SELECT s.id, s.name, s.payout_percent, s.eap_session_fee FROM staff s
     WHERE ($1::uuid IS NULL OR s.id = $1)
       AND EXISTS (SELECT 1 FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
                   WHERE r.assigned_to = s.id AND cs.done_at IS NOT NULL AND NOT cs.is_discovery
                     AND to_char(cs.starts_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $2)
     ORDER BY s.name`,
    [onlyStaff, ym],
  );
  const out: Payout[] = [];
  for (const s of staff) {
    const { rows } = await pool.query<{ starts_at: Date; first_name: string; kind: "eap" | "private"; late_cancelled: boolean; price: number | null; paid: boolean }>(
      `SELECT cs.starts_at, r.first_name, r.kind, cs.late_cancelled, cs.price_czk AS price, cs.paid_at IS NOT NULL AS paid
       FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id
       WHERE r.assigned_to = $1 AND cs.done_at IS NOT NULL AND NOT cs.is_discovery
         AND to_char(cs.starts_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $2
       ORDER BY cs.starts_at`,
      [s.id, ym],
    );
    const lines: PayoutLine[] = rows.map((r) => {
      const gross = r.kind === "private" ? (r.price ?? 0) : 0;
      const net = toNet(gross);
      const payout = r.kind === "private" ? Math.round((net * s.payout_percent) / 100) : s.eap_session_fee;
      return { starts_at: r.starts_at, first_name: r.first_name, kind: r.kind, late_cancelled: r.late_cancelled, gross, net, paid: r.paid, payout };
    });
    const priv = lines.filter((l) => l.kind === "private");
    out.push({
      staff_id: s.id,
      name: s.name,
      percent: s.payout_percent,
      eap_fee: s.eap_session_fee,
      eap_sessions: lines.length - priv.length,
      private_sessions: priv.length,
      private_net: priv.reduce((a, l) => a + l.net, 0),
      private_net_paid: priv.filter((l) => l.paid).reduce((a, l) => a + l.net, 0),
      payout: lines.reduce((a, l) => a + l.payout, 0),
      lines,
    });
  }
  return out;
}
