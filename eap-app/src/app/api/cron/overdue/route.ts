import { timingSafeEqual } from "node:crypto";
import { assignWaitingAndNotify } from "@/lib/assign";
import { releaseExpiredOffers, remindPendingOffers, sendDailyDigest } from "@/lib/offers";
import { warnOverdue } from "@/lib/overdue";
import { sendSessionReminders } from "@/lib/session-reminders";
import { alertOverdueInvoices, autoMonthlyInvoices } from "@/lib/invoice-mail";
import { monthEndReminders, sendMonthlyExport } from "@/lib/month-end";

export const dynamic = "force-dynamic";

// Called hourly by the scheduler (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const offerReminders = await remindPendingOffers();
  const released = await releaseExpiredOffers();
  const assigned = (await assignWaitingAndNotify()).length; // e.g. places open at the start of a month
  const reminders = await warnOverdue();
  const digestSent = await sendDailyDigest();
  const sessionReminders = await sendSessionReminders();
  const monthlyInvoices = await autoMonthlyInvoices();
  const overdueInvoices = await alertOverdueInvoices();
  const monthEnd = await monthEndReminders();
  const exportSent = await sendMonthlyExport();
  return Response.json({
    offerReminders, released, assigned, reminders, digestSent, sessionReminders,
    monthlyInvoices, overdueInvoices, monthEnd, exportSent,
  });
}
