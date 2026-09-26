import { currentStaff, isManager } from "@/lib/auth";
import { pool } from "@/lib/db";
import { invoiceFileName, loadInvoice, renderInvoice } from "@/lib/invoice-pdf";

// The invoice PDF for a payment, for staff who can see the client's case. The first download gives
// the payment its invoice number.
export async function GET(_req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const staff = await currentStaff();
  if (!staff) return new Response("Please sign in.", { status: 401 });
  // Invoices are for coordinators and admins; counsellors only see amounts on the client's page.
  if (!isManager(staff)) return new Response("Not found", { status: 404 });
  const { paymentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return new Response("Not found", { status: 404 });
  const { rows } = await pool.query<{ assigned_to: string | null }>(
    "SELECT r.assigned_to FROM payments p JOIN support_requests r ON r.id = p.request_id WHERE p.id = $1",
    [paymentId],
  );
  if (!rows[0] || (!isManager(staff) && rows[0].assigned_to !== staff.id)) return new Response("Not found", { status: 404 });
  // A running monthly invoice (a draft) is shown as a preview; it's numbered when issued.
  const data = await loadInvoice(paymentId, true);
  const pdf = await renderInvoice(data);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceFileName(data.number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
