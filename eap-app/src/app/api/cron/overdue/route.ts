import { timingSafeEqual } from "node:crypto";
import { warnOverdue } from "@/lib/overdue";

export const dynamic = "force-dynamic";

// Called hourly by the scheduler (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await warnOverdue();
  return Response.json(result);
}
