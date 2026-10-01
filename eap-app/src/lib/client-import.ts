// Clients from the previous system, imported from an Excel or CSV sheet: first name, surname and email.
import ExcelJS from "exceljs";

export type ImportedClient = { firstName: string; surname: string; email: string; row: number };
export type ParsedSheet = { clients: ImportedClient[]; invalid: number[]; duplicateInFile: number[]; missingColumns?: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const FIRST = ["firstname", "first", "name", "givenname", "jmeno", "krestnijmeno", "ime"];
const SURNAME = ["surname", "lastname", "last", "familyname", "prijmeni", "prezime"];
const FULL = ["fullname", "nameandsurname", "client", "clientname", "jmenoaprijmeni", "celejmeno"];
const EMAIL = ["email", "emailaddress", "mail", "email1"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Finds the header row (within the first 10) and reads one client per row after it. */
export function parseClientRows(rows: string[][]): ParsedSheet {
  for (let h = 0; h < Math.min(rows.length, 10); h++) {
    const head = rows[h].map((c) => norm(c ?? ""));
    const col = (names: string[]) => head.findIndex((c) => names.includes(c));
    const email = col(EMAIL);
    const first = col(FIRST);
    const surname = col(SURNAME);
    const full = col(FULL);
    if (email < 0 || (first < 0 && full < 0)) continue;
    const out: ParsedSheet = { clients: [], invalid: [], duplicateInFile: [] };
    const seen = new Set<string>();
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i].map((c) => String(c ?? "").trim().replace(/\s+/g, " "));
      if (r.every((c) => !c)) continue;
      let firstName = first >= 0 ? r[first] ?? "" : "";
      let last = surname >= 0 ? r[surname] ?? "" : "";
      if (full >= 0 && (!firstName || (!last && surname < 0))) {
        const parts = (r[full] ?? "").split(" ").filter(Boolean);
        if (!firstName) firstName = parts[0] ?? "";
        if (!last) last = parts.slice(1).join(" ");
      } else if (first >= 0 && surname < 0 && firstName.includes(" ")) {
        // One "Name" column holding the whole name.
        const parts = firstName.split(" ");
        firstName = parts[0];
        last = parts.slice(1).join(" ");
      }
      const mail = (r[email] ?? "").toLowerCase().replace(/^mailto:/, "");
      if (!firstName || !EMAIL_RE.test(mail)) {
        out.invalid.push(i + 1);
        continue;
      }
      if (seen.has(mail)) {
        out.duplicateInFile.push(i + 1);
        continue;
      }
      seen.add(mail);
      out.clients.push({ firstName: firstName.slice(0, 80), surname: last.slice(0, 80), email: mail.slice(0, 200), row: i + 1 });
    }
    return out;
  }
  return { clients: [], invalid: [], duplicateInFile: [], missingColumns: "Couldn't find the columns. The first row should have headings like Name, Surname and Email." };
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text; // hyperlink
    if ("result" in v) return String(v.result ?? ""); // formula
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
  }
  return String(v);
};

function csvRows(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));
}

/** Reads the first sheet of an .xlsx file, or a .csv file. */
export async function readSheet(name: string, data: ArrayBuffer): Promise<string[][]> {
  if (/\.csv$|\.txt$/i.test(name)) return csvRows(new TextDecoder("utf-8").decode(data));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value));
    rows.push(cells);
  });
  return rows;
}
