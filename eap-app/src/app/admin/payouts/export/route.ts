import ExcelJS from "exceljs";
import { currentStaff, isOwner } from "@/lib/auth";
import { monthPayouts } from "@/lib/payouts";
import { NOTICE } from "@/lib/sessions-export";

// Excel sheet of a month's counsellor payouts. The owner only.
export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response("Please sign in.", { status: 401 });
  if (!isOwner(staff)) return new Response("Not found", { status: 404 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Choose a month.", { status: 400 });
  const payouts = await monthPayouts(month);
  const wb = new ExcelJS.Workbook();
  wb.creator = wb.company = "Prague Integration s.r.o.";
  const ws = wb.addWorksheet(`Payouts ${month}`, {
    headerFooter: { oddFooter: `&L© ${new Date().getFullYear()} Prague Integration s.r.o. All rights reserved. Confidential – do not distribute.` },
  });
  ws.addRow([`Prague Integration s.r.o. – Counsellor payouts ${month}`]).font = { bold: true, size: 14 };
  const n = ws.addRow([NOTICE(new Date().getFullYear())]);
  n.font = { italic: true, size: 9, color: { argb: "FF7A1F1F" } };
  ws.mergeCells(n.number, 1, n.number, 8);
  n.alignment = { wrapText: true, vertical: "top" };
  n.height = 42;
  ws.addRow([]);
  const h = ws.addRow(["Counsellor", "Share %", "EAP fee", "Private sessions", "EAP sessions", "Private fees without VAT", "Not yet paid by clients", "Payout (CZK)"]);
  h.font = { bold: true };
  for (const p of payouts)
    ws.addRow([p.name, p.percent, p.eap_fee, p.private_sessions, p.eap_sessions, p.private_net, p.private_net - p.private_net_paid, p.payout]);
  ws.addRow([]);
  ws.addRow(["Total", "", "", "", "", payouts.reduce((a, p) => a + p.private_net, 0), "", payouts.reduce((a, p) => a + p.payout, 0)]).font = { bold: true };
  [24, 9, 10, 16, 13, 22, 22, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (const p of payouts) {
    const s = wb.addWorksheet(p.name.slice(0, 28).replace(/[\\/?*[\]:]/g, " "));
    s.addRow([`${p.name} – ${month}`]).font = { bold: true };
    s.addRow(["Date", "Client", "Type", "Fee without VAT", "Client paid", "Payout"]).font = { bold: true };
    for (const l of p.lines)
      s.addRow([l.starts_at.toISOString().slice(0, 10), l.first_name, l.kind === "eap" ? "EAP" : l.late_cancelled ? "Private (late cancellation)" : "Private", l.kind === "private" ? l.net : "", l.kind === "private" ? (l.paid ? "Yes" : "No") : "", l.payout]);
    s.addRow(["Total", "", "", p.private_net, "", p.payout]).font = { bold: true };
    [12, 18, 26, 16, 12, 12].forEach((w, i) => (s.getColumn(i + 1).width = w));
  }
  return new Response(new Uint8Array(await wb.xlsx.writeBuffer()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="prague-integration-payouts-${month}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
