// Exports of invoices: one combined PDF, and a CSV list (for Czech Excel).
import { pool } from "./db";
import { invoiceSettings, vatSplit } from "./billing";
import { loadInvoice, renderInvoices, type InvoiceData } from "./invoice-pdf";

/** Invoices issued or paid in a month (or monthly invoices for it). */
export async function monthPaymentIds(month: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM payments
     WHERE (invoice_number IS NOT NULL OR paid_on IS NOT NULL) -- not drafts still building up
       AND (period = $1
        OR to_char(COALESCE(invoiced_at AT TIME ZONE 'Europe/Prague', paid_on::timestamp), 'YYYY-MM') = $1)
     ORDER BY COALESCE(invoiced_at, created_at)`,
    [month],
  );
  return rows.map((r) => r.id);
}

/** Loads the invoices (payments without a number get one). */
export async function loadInvoices(ids: string[]): Promise<{ id: string; data: InvoiceData }[]> {
  const out = [];
  for (const id of ids) out.push({ id, data: await loadInvoice(id) });
  return out;
}

export const invoicesPdf = (list: { data: InvoiceData }[]) => renderInvoices(list.map((i) => i.data));

export async function invoicesCsv(list: { id: string; data: InvoiceData }[]): Promise<string> {
  const settings = await invoiceSettings();
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const money = (h: number) => (h / 100).toFixed(2).replace(".", ",");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  const lines = [
    ["Číslo faktury", "Odběratel", "E-mail", "Adresa", "Variabilní symbol", "Datum vystavení", "DUZP", "Splatnost", "Uhrazeno", "Počet sezení", "Základ", "DPH", "Celkem", "Stav"],
    ...list.map(({ data: d }) => {
      const v = settings.vatPayer ? vatSplit(d.total, settings.vatRate) : { base: d.total * 100, vat: 0, gross: d.total * 100 };
      const overdue = !d.paidOn && d.dueOn && d.dueOn < today;
      return [
        d.number,
        d.customerName,
        d.customerEmail,
        d.customerAddress,
        d.variableSymbol,
        new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(d.issuedOn),
        d.taxDate,
        d.dueOn ?? "",
        d.paidOn ?? "",
        d.sessionCount,
        money(v.base),
        money(v.vat),
        money(v.gross),
        d.paidOn ? "Uhrazeno" : overdue ? "Po splatnosti" : "K úhradě",
      ];
    }),
  ];
  // Semicolons and a BOM, so Czech Excel opens it with the right columns and letters.
  return "﻿" + lines.map((l) => l.map(cell).join(";")).join("\r\n");
}
