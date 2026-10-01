// Counsellors upload their own invoice to Prague Integration for each month's payout, by the 10th of
// the following month. They see only their own; admins see everyone's.
import { pool } from "./db";

export const INVOICE_DUE_DAY = 10;
export const MAX_INVOICE_BYTES = 5 * 1024 * 1024;
export const INVOICE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** The 10th of the month after the sessions, as YYYY-MM-DD. */
export function invoiceDueDate(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return `${next}-${String(INVOICE_DUE_DAY).padStart(2, "0")}`;
}

export type InvoiceInfo = { staff_id: string; filename: string; uploaded_at: Date };

export async function invoicesFor(period: string): Promise<Map<string, InvoiceInfo>> {
  const { rows } = await pool.query<InvoiceInfo>(
    "SELECT staff_id, filename, uploaded_at FROM counsellor_invoices WHERE period = $1",
    [period],
  );
  return new Map(rows.map((r) => [r.staff_id, r]));
}
