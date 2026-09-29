import { conversationFor } from "@/lib/messages";
import { sessionPayment, sessionQrPng } from "@/lib/session-qr";

// The payment QR code for one of the client's own sessions, shown on their private page.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; sessionId: string }> }) {
  const { token, sessionId } = await params;
  const convo = await conversationFor(token);
  if (!convo || !/^[0-9a-f-]{36}$/i.test(sessionId)) return new Response("Not found", { status: 404 });
  const pay = await sessionPayment(sessionId);
  if (!pay || pay.requestId !== convo.requestId) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await sessionQrPng(pay)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
