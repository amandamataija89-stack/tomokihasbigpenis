// Excel export of sessions for a month: a counsellor's own, or (coordinators and admins) everyone's or one
// counsellor's. Carries Prague Integration's copyright and confidentiality notice, as it contains personal data.
import ExcelJS from "exceljs";
import { appUrl } from "./app-url";
import { pool } from "./db";

type Row = {
  starts_at: Date;
  done_at: Date | null;
  late_cancelled: boolean;
  is_discovery: boolean;
  price_czk: number | null;
  paid_at: Date | null;
  first_name: string;
  full_name: string;
  kind: "eap" | "private";
  company: string | null;
  service: string;
  variable_symbol: string | null;
  counsellor: string | null;
};

const pragueDate = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" });
const pragueTime = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });

export const NOTICE = (year: number) =>
  `© ${year} Prague Integration s.r.o. All rights reserved. CONFIDENTIAL – DO NOT DISTRIBUTE. Contains personal data of ` +
  `Prague Integration's clients. For Prague Integration work only; do not share, forward, upload or print for others. Handle under our Privacy Policy (${appUrl()}/privacy) and delete when no longer needed.`;

export async function sessionsWorkbook(month: string, counsellorId: string | null, title: string): Promise<Buffer> {
  const { rows } = await pool.query<Row>(
    `SELECT cs.starts_at, cs.done_at, cs.late_cancelled, cs.is_discovery, cs.price_czk, cs.paid_at,
       r.first_name, r.full_name, r.kind, c.name AS company, r.service, r.variable_symbol, s.name AS counsellor
     FROM client_sessions cs
     JOIN support_requests r ON r.id = cs.request_id
     LEFT JOIN companies c ON c.id = r.company_id
     LEFT JOIN staff s ON s.id = r.assigned_to
     WHERE to_char(cs.starts_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = $1 AND ($2::uuid IS NULL OR r.assigned_to = $2)
     ORDER BY cs.starts_at`,
    [month, counsellorId],
  );
  const now = new Date();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Prague Integration s.r.o.";
  wb.company = "Prague Integration s.r.o.";
  wb.created = now;
  const ws = wb.addWorksheet(`Sessions ${month}`, {
    headerFooter: { oddFooter: `&L© ${now.getFullYear()} Prague Integration s.r.o. All rights reserved. Confidential – do not distribute.&RPage &P of &N` },
  });
  ws.addRow([`Prague Integration s.r.o. – ${title}`]).font = { bold: true, size: 14 };
  const notice = ws.addRow([NOTICE(now.getFullYear())]);
  notice.font = { italic: true, size: 9, color: { argb: "FF7A1F1F" } };
  ws.mergeCells(notice.number, 1, notice.number, 11);
  notice.alignment = { wrapText: true, vertical: "top" };
  notice.height = 42;
  ws.addRow([]);
  const header = ws.addRow([
    "Date", "Time", "Client (name used)", "Full name", "Client of", "Type of counselling", "Counsellor", "Session", "Status", "Price incl. VAT (CZK)", "Paid",
  ]);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F0E9" } };
    c.border = { bottom: { style: "thin" } };
  });
  let held = 0;
  let amount = 0;
  for (const r of rows) {
    const status = r.late_cancelled
      ? "Late cancellation (charged)"
      : r.done_at
        ? "Held"
        : r.starts_at < now
          ? "Not marked yet"
          : "Booked";
    if (r.done_at || r.late_cancelled) held++;
    const price = r.kind === "private" && !r.is_discovery ? r.price_czk : null;
    if (price && (r.done_at || r.late_cancelled)) amount += price;
    ws.addRow([
      pragueDate.format(r.starts_at),
      pragueTime.format(r.starts_at),
      r.first_name,
      r.full_name || "",
      r.kind === "eap" ? `EAP · ${r.company ?? ""}` : `Private${r.variable_symbol ? ` · VS ${r.variable_symbol}` : ""}`,
      r.service || "",
      r.counsellor ?? "",
      r.is_discovery ? "Free discovery session" : "Session",
      status,
      price ?? "",
      r.kind === "private" && !r.is_discovery ? (r.paid_at ? "Yes" : "No") : "",
    ]);
  }
  ws.addRow([]);
  const total = ws.addRow(["Total", "", `${rows.length} sessions`, "", "", "", "", "", `${held} held`, amount, ""]);
  total.font = { bold: true };
  ws.getColumn(10).numFmt = "#,##0";
  [12, 7, 18, 22, 26, 26, 18, 22, 26, 20, 7].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: header.number }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
