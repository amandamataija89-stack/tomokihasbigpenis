import { currentStaff, isManager } from "@/lib/auth";
import { invoiceSettings, vatSplit } from "@/lib/billing";
import { pool } from "@/lib/db";
import { loadInvoice, renderInvoices } from "@/lib/invoice-pdf";

// Exports invoices as one PDF, or as a CSV list for the accountant:
//   ?client=<request id>            all of that client's invoices (their counsellor, coordinators, admins)
//   ?month=YYYY-MM[&format=csv]     invoices issued or paid that month (coordinators and admins)
// Payments without an invoice number get one when exported.
export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response("Please sign in.", { status: 401 });
  const url = new URL(req.url);
  const client = url.searchParams.get("client");
  const month = url.searchParams.get("month");
  let ids: string[] = [];
  let name = "faktury";
  if (client && /^[0-9a-f-]{36}$/i.test(client)) {
    const { rows } = await pool.query<{ assigned_to: string | null; first_name: string }>(
      "SELECT assigned_to, first_name FROM support_requests WHERE id = $1 AND kind = 'private'",
      [client],
    );
    if (!rows[0] || (!isManager(staff) && rows[0].assigned_to !== staff.id)) return new Response("Not found", { status: 404 });
    const { rows: p } = await pool.query<{ id: string }>(
      "SELECT id FROM payments WHERE request_id = $1 ORDER BY COALESCE(invoiced_at, created_at)",
      [client],
    );
    ids = p.map((r) => r.id);
    name = `faktury-${rows[0].first_name.replace(/[^\w-]+/g, "-")}`;
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    if (!isManager(staff)) return new Response("Not found", { status: 404 });
    const { rows: p } = await pool.query<{ id: string }>(
      `SELECT id FROM payments
       WHERE period = $1
          OR to_char(COALESCE(invoiced_at AT TIME ZONE 'Europe/Prague', paid_on::timestamp), 'YYYY-MM') = $1
       ORDER BY COALESCE(invoiced_at, created_at)`,
      [month],
    );
    ids = p.map((r) => r.id);
    name = `faktury-${month}`;
  } else return new Response("Choose a client or a month.", { status: 400 });

  if (!ids.length) return new Response("No invoices to export.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const invoices = [];
  for (const id of ids) invoices.push({ id, data: await loadInvoice(id) });

  if (url.searchParams.get("format") === "csv") {
    const settings = await invoiceSettings();
    const { rows: who } = await pool.query<{ id: string; first_name: string; full_name: string; billing_name: string }>(
      "SELECT p.id, r.first_name, r.full_name, r.billing_name FROM payments p JOIN support_requests r ON r.id = p.request_id WHERE p.id = ANY($1::uuid[])",
      [ids],
    );
    const nameOf = new Map(who.map((w) => [w.id, w.billing_name || w.full_name || w.first_name]));
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const money = (h: number) => (h / 100).toFixed(2).replace(".", ",");
    const lines = [
      ["Číslo faktury", "Odběratel", "Variabilní symbol", "Datum vystavení", "DUZP", "Splatnost", "Uhrazeno", "Počet sezení", "Základ", "DPH", "Celkem", "Stav"],
      ...invoices.map(({ id, data: d }) => {
        const v = settings.vatPayer ? vatSplit(d.total, settings.vatRate) : { base: d.total * 100, vat: 0, gross: d.total * 100 };
        const overdue = !d.paidOn && d.dueOn && d.dueOn < new Date().toISOString().slice(0, 10);
        return [
          d.number,
          nameOf.get(id) ?? "",
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
    const csv = "﻿" + lines.map((l) => l.map(cell).join(";")).join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const pdf = await renderInvoices(invoices.map((i) => i.data));
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
