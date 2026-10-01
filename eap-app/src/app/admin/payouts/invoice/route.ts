import { currentStaff } from "@/lib/auth";
import { pool } from "@/lib/db";

// A counsellor's uploaded invoice: only the counsellor themselves and admins.
export async function GET(req: Request) {
  const me = await currentStaff();
  if (!me) return new Response("Please sign in.", { status: 401 });
  const url = new URL(req.url);
  const staffId = url.searchParams.get("staff") ?? "";
  const month = url.searchParams.get("month") ?? "";
  if (staffId !== me.id && me.role !== "admin") return new Response("Not found", { status: 404 });
  if (!/^\d{4}-\d{2}$/.test(month) || !/^[0-9a-f-]{36}$/.test(staffId)) return new Response("Not found", { status: 404 });
  const { rows } = await pool.query<{ filename: string; mime: string; content: Buffer }>(
    "SELECT filename, mime, content FROM counsellor_invoices WHERE staff_id = $1 AND period = $2",
    [staffId, month],
  );
  if (!rows[0]) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(rows[0].content), {
    headers: {
      "Content-Type": rows[0].mime,
      "Content-Disposition": `inline; filename="${rows[0].filename.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
