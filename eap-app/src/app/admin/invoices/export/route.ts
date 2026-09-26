import { currentStaff, isManager } from "@/lib/auth";
import { pool } from "@/lib/db";
import { invoicesCsv, invoicesPdf, loadInvoices, monthPaymentIds } from "@/lib/invoice-export";

// Exports invoices as one PDF, or as a CSV list (coordinators and admins):
//   ?client=<request id>            all of that client's invoices
//   ?month=YYYY-MM[&format=csv]     invoices issued or paid that month (coordinators and admins)
// Payments without an invoice number get one when exported.
export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response("Please sign in.", { status: 401 });
  // Invoices are for coordinators and admins; counsellors only see amounts on the client's page.
  if (!isManager(staff)) return new Response("Not found", { status: 404 });
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
      "SELECT id FROM payments WHERE request_id = $1 AND (invoice_number IS NOT NULL OR paid_on IS NOT NULL) ORDER BY COALESCE(invoiced_at, created_at)",
      [client],
    );
    ids = p.map((r) => r.id);
    name = `faktury-${rows[0].first_name.replace(/[^\w-]+/g, "-")}`;
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    ids = await monthPaymentIds(month);
    name = `faktury-${month}`;
  } else return new Response("Choose a client or a month.", { status: 400 });

  if (!ids.length) return new Response("No invoices to export.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const invoices = await loadInvoices(ids);
  if (url.searchParams.get("format") === "csv")
    return new Response(await invoicesCsv(invoices), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  const pdf = await invoicesPdf(invoices);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
