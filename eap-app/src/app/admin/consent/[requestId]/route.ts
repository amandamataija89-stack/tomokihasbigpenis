import { currentStaff, isManager } from "@/lib/auth";
import { latestConsent, renderConsentPdf } from "@/lib/consent";
import { pool } from "@/lib/db";

// Staff who can see the case download the client's signed consent form.
export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const staff = await currentStaff();
  if (!staff) return new Response("Please sign in.", { status: 401 });
  const { requestId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return new Response("Not found", { status: 404 });
  const { rows } = await pool.query<{ assigned_to: string | null; first_name: string }>(
    "SELECT assigned_to, first_name FROM support_requests WHERE id = $1",
    [requestId],
  );
  if (!rows[0] || (!isManager(staff) && rows[0].assigned_to !== staff.id)) return new Response("Not found", { status: 404 });
  const signed = await latestConsent(requestId);
  if (!signed) return new Response("Not signed yet.", { status: 404 });
  return new Response(Buffer.from(await renderConsentPdf(signed)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="consent-${rows[0].first_name.replace(/[^\w-]+/g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
