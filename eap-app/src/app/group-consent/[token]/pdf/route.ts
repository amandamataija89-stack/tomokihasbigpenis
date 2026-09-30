import { renderConsentPdf } from "@/lib/consent";
import { latestGroupConsent, memberForToken } from "@/lib/group-consent";

// A group member downloads their signed consent form.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const m = await memberForToken(token);
  const signed = m ? await latestGroupConsent(m.memberId) : null;
  if (!signed) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(await renderConsentPdf(signed)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="prague-integration-consent-form.pdf"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
