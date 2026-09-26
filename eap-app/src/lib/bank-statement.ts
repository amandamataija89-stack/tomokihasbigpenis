// Reads a bank statement exported as CSV from online banking (Raiffeisenbank and most Czech banks) and
// matches incoming payments to unpaid invoices by the client's variable symbol and the amount.
import { createHash } from "node:crypto";
import { pool } from "./db";
import { markInvoicePaid } from "./billing";

export type Transaction = {
  date: string; // YYYY-MM-DD
  amount: number; // CZK; incoming payments are positive
  vs: string; // variable symbol, digits only; "" if none
  counterparty: string;
  message: string;
  key: string; // identifies the transaction, so importing the same statement twice changes nothing
};

/** Statements come as UTF-8 or, from Czech banks, often windows-1250. */
export function decodeStatement(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1250").decode(bytes);
  }
}

/** Splits CSV text into rows, handling quotes, on the given delimiter. */
function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** "1 815,00", "1.815,00", "-1815.00", "1815 CZK" → number. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[\s ]|CZK|Kč/gi, "");
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "12.10.2026", "12. 10. 2026", "2026-10-12" (with or without a time) → "2026-10-12". */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// Column names seen in Czech bank exports, best match first.
const COLUMNS = {
  amount: ["zauctovana castka", "castka", "objem", "amount", "castka v mene uctu"],
  date: ["datum provedeni", "datum zauctovani", "datum", "date", "booking date", "datum splatnosti"],
  vs: ["vs", "variabilni symbol", "variable symbol", "var. symbol"],
  counterparty: ["nazev protiuctu", "nazev protistrany", "protiucet", "counterparty", "counterparty name", "nazev"],
  message: ["zprava", "zprava pro prijemce", "poznamka", "message", "popis", "description", "informace k platbe"],
};

function findColumn(header: string[], names: string[]): number {
  const h = header.map(norm);
  for (const n of names) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = h.findIndex((c) => c.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
}

/** Reads the transactions from a statement CSV. Throws a plain-English error if it can't find the columns. */
export function parseStatement(text: string): Transaction[] {
  const firstLines = text.split(/\r?\n/).slice(0, 30).join("\n");
  const delimiter = [";", ",", "\t"].sort(
    (a, b) => firstLines.split(b).length - firstLines.split(a).length,
  )[0];
  const rows = csvRows(text, delimiter);
  const headerAt = rows.findIndex((r) => findColumn(r, COLUMNS.amount) >= 0 && findColumn(r, COLUMNS.date) >= 0);
  if (headerAt < 0)
    throw new Error(
      "Couldn't find the date and amount columns. Please export the statement as CSV from online banking (not PDF) and upload that file.",
    );
  const header = rows[headerAt];
  const col = {
    amount: findColumn(header, COLUMNS.amount),
    date: findColumn(header, COLUMNS.date),
    vs: findColumn(header, COLUMNS.vs),
    counterparty: findColumn(header, COLUMNS.counterparty),
    message: findColumn(header, COLUMNS.message),
  };
  const seen = new Map<string, number>();
  const out: Transaction[] = [];
  for (const r of rows.slice(headerAt + 1)) {
    const amount = parseAmount(r[col.amount] ?? "");
    const date = parseDate(r[col.date] ?? "");
    if (amount === null || !date) continue;
    const message = col.message >= 0 ? (r[col.message] ?? "") : "";
    let vs = col.vs >= 0 ? (r[col.vs] ?? "").replace(/\D/g, "").replace(/^0+/, "") : "";
    // No VS column (or it's empty): look for "VS 100002" or "/VS100002" in the message.
    if (!vs) vs = message.match(/VS\D{0,3}(\d{1,10})/i)?.[1]?.replace(/^0+/, "") ?? "";
    const counterparty = col.counterparty >= 0 ? (r[col.counterparty] ?? "") : "";
    const base = [date, amount.toFixed(2), vs, counterparty, message].join("|");
    // Two identical payments on the same day stay two transactions.
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ date, amount, vs, counterparty, message, key: createHash("sha256").update(`${base}|${n}`).digest("hex") });
  }
  return out;
}

export type ImportResult = {
  incoming: number; // incoming payments in the file
  alreadyImported: number;
  paid: { firstName: string; invoice: string; amount: number; date: string }[];
  unmatched: { date: string; amount: number; vs: string; counterparty: string; reason: string }[];
};

/**
 * Marks invoices paid from a statement: an incoming payment whose variable symbol is a client's pays that
 * client's unpaid invoice of exactly that amount (oldest first), or all their unpaid invoices if it equals
 * their total. Anything else is listed for the coordinator to check.
 */
export async function importStatement(transactions: Transaction[]): Promise<ImportResult> {
  const result: ImportResult = { incoming: 0, alreadyImported: 0, paid: [], unmatched: [] };
  for (const t of transactions) {
    if (t.amount <= 0) continue;
    result.incoming++;
    const { rowCount: fresh } = await pool.query(
      "INSERT INTO bank_transactions (key, booked_on, amount, vs) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING",
      [t.key, t.date, t.amount, t.vs],
    );
    if (!fresh) {
      result.alreadyImported++;
      continue;
    }
    const unmatched = (reason: string) =>
      result.unmatched.push({ date: t.date, amount: t.amount, vs: t.vs, counterparty: t.counterparty, reason });
    if (!t.vs) {
      unmatched("No variable symbol");
      continue;
    }
    const { rows: client } = await pool.query<{ id: string; first_name: string }>(
      "SELECT id, first_name FROM support_requests WHERE variable_symbol = $1",
      [t.vs],
    );
    if (!client[0]) {
      unmatched("Variable symbol isn't a client's");
      continue;
    }
    const { rows: open } = await pool.query<{ id: string; invoice_number: string; amount_czk: number }>(
      `SELECT id, invoice_number, amount_czk FROM payments
       WHERE request_id = $1 AND paid_on IS NULL AND invoice_number IS NOT NULL ORDER BY due_on, invoice_number`,
      [client[0].id],
    );
    const exact = open.find((o) => o.amount_czk === t.amount);
    const all = open.reduce((a, o) => a + o.amount_czk, 0);
    const toPay = exact ? [exact] : open.length > 1 && all === t.amount ? open : [];
    if (!toPay.length) {
      unmatched(open.length ? `${client[0].first_name}: amount doesn't match an unpaid invoice` : `${client[0].first_name}: no unpaid invoice`);
      continue;
    }
    for (const o of toPay) {
      await markInvoicePaid(client[0].id, o.id, t.date, "Bank transfer");
      await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
        client[0].id,
        `Invoice ${o.invoice_number} marked paid from the bank statement (${t.amount} CZK on ${t.date}).`,
      ]);
      result.paid.push({ firstName: client[0].first_name, invoice: o.invoice_number, amount: o.amount_czk, date: t.date });
    }
    await pool.query("UPDATE bank_transactions SET payment_id = $2 WHERE key = $1", [t.key, toPay[0].id]);
  }
  return result;
}
