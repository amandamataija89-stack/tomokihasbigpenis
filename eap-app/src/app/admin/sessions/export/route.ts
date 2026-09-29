import { currentStaff } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sessionsWorkbook } from "@/lib/sessions-export";

// Excel sheet of a month's sessions: ?month=YYYY-MM[&counsellor=<staff id>]. Admins only.
export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response("Please sign in.", { status: 401 });
  if (staff.role !== "admin") return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Choose a month.", { status: 400 });
  const asked = url.searchParams.get("counsellor") ?? "";
  const counsellorId = /^[0-9a-f-]{36}$/i.test(asked) ? asked : null;
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
