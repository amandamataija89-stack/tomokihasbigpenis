import { currentStaff } from "@/lib/auth";
import { renderConsentPdf } from "@/lib/consent";
import { getGroup } from "@/lib/groups";
import { latestGroupConsent } from "@/lib/group-consent";
import { pool } from "@/lib/db";

// A group member's signed consent form, for the group's counsellor, coordinators and admins.
export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string; memberId: string }> }) {
  const staff = await currentStaff();
  if (!staff) return new Response("Please sign in.", { status: 401 });
  const { groupId, memberId } = await params;
  if (!(await getGroup(groupId, staff)) || !/^[0-9a-f-]{36}$/i.test(memberId)) return new Response("Not found", { status: 404 });
  const { rows } = await pool.query("SELECT 1 FROM group_members WHERE id = $1 AND group_id = $2", [memberId, groupId]);
  const signed = rows.length ? await latestGroupConsent(memberId) : null;
  if (!signed) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(await renderConsentPdf(signed)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="consent-form-${signed.fullName.replace(/[^\w-]+/g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
