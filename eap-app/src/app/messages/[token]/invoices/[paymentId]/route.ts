import { pool } from "@/lib/db";
import { invoiceFileName, loadInvoice, renderInvoice } from "@/lib/invoice-pdf";
import { conversationFor } from "@/lib/messages";

// A client downloads one of their issued invoices from their private page.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; paymentId: string }> }) {
  const { token, paymentId } = await params;
  const convo = await conversationFor(token);
  if (!convo || !/^[0-9a-f-]{36}$/i.test(paymentId)) return new Response("Not found", { status: 404 });
  const { rowCount } = await pool.query(
    "SELECT 1 FROM payments WHERE id = $1 AND request_id = $2 AND invoice_number IS NOT NULL",
    [paymentId, convo.requestId],
  );
  if (!rowCount) return new Response("Not found", { status: 404 });
  const data = await loadInvoice(paymentId);
  return new Response(Buffer.from(await renderInvoice(data)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceFileName(data.number)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
