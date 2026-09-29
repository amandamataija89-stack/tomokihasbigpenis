import { currentStaff, isManager } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sessionPayment, sessionQrPng } from "@/lib/session-qr";

// The payment QR code for one session, e.g. to show the client in person. Staff who can see the case.
export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const staff = await currentStaff();
  if (!staff) return new Response("Please sign in.", { status: 401 });
  const { sessionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return new Response("Not found", { status: 404 });
  const { rows } = await pool.query<{ assigned_to: string | null }>(
    "SELECT r.assigned_to FROM client_sessions cs JOIN support_requests r ON r.id = cs.request_id WHERE cs.id = $1",
    [sessionId],
  );
  if (!rows[0] || (!isManager(staff) && rows[0].assigned_to !== staff.id)) return new Response("Not found", { status: 404 });
  const pay = await sessionPayment(sessionId);
  if (!pay) return new Response("This session has nothing to pay (already paid, on an invoice, or no price).", { status: 404 });
  return new Response(new Uint8Array(await sessionQrPng(pay)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
  });
}
