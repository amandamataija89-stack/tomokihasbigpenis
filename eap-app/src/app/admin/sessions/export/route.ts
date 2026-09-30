import { currentStaff, isOwner } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sessionsWorkbook } from "@/lib/sessions-export";

// Excel sheet of a month's sessions: ?month=YYYY-MM[&counsellor=<staff id>]. The owner exports anyone's;
// everyone else only their own clients' sessions.
export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response("Please sign in.", { status: 401 });
  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Choose a month.", { status: 400 });
  const asked = url.searchParams.get("counsellor") ?? "";
  const counsellorId = isOwner(staff) ? (/^[0-9a-f-]{36}$/i.test(asked) ? asked : null) : staff.id;
  let who = "all counsellors";
  if (counsellorId) {
    const { rows } = await pool.query<{ name: string }>("SELECT name FROM staff WHERE id = $1", [counsellorId]);
    who = rows[0]?.name ?? "counsellor";
  }
  const file = await sessionsWorkbook(month, counsellorId, `Sessions ${month}, ${who}`);
  const name = `prague-integration-sessions-${month}${counsellorId ? `-${who.replace(/[^\w-]+/g, "-")}` : ""}.xlsx`;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
