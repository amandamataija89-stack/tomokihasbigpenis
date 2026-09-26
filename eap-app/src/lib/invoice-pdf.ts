// Invoice PDFs for private clients' payments, in Czech and English.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { pool } from "./db";
import { ensureVariableSymbol, invoiceSettings, issueInvoice, qrPlatba, vatSplit, type InvoiceSettings } from "./billing";
import { LIBERATION_SANS_BOLD, LIBERATION_SANS_REGULAR } from "./fonts/liberation-sans";

export type InvoiceLine = { text: string; amount: number; detail?: string };

// The item name on invoices for each kind of support.
const ITEM_NAMES: Record<string, string> = {
  "Individual counselling": "Mental Health Counselling Services – Individual",
  "Couple counselling": "Mental Health Counselling Services – Couples",
  "Children or teenager counselling": "Mental Health Counselling Services – Children & Teenagers",
  "ADHD testing": "ADHD Testing",
};
export const itemName = (service: string) => ITEM_NAMES[service] ?? "Mental Health Counselling Services";

export type InvoiceData = {
  number: string;
  issuedOn: Date;
  paidOn: string | null; // YYYY-MM-DD; null: not paid yet
  dueOn: string | null; // YYYY-MM-DD, for an invoice to pay
  variableSymbol: string;
  period: string | null; // 'YYYY-MM' for a monthly invoice
  sessionCount: number;
  qr: string | null; // QR Platba text, for an invoice to pay
  taxDate: string; // YYYY-MM-DD, datum uskutečnění zdanitelného plnění (DUZP)
  method: string;
  customer: string[]; // lines: name, address, IČO, DIČ
  lines: InvoiceLine[];
  total: number;
  supplier: InvoiceSettings;
};

const czk = (n: number) => `${n.toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
const day = (d: Date) =>
  new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" }).format(d);
const isoDay = (s: string) => day(new Date(`${s}T12:00:00Z`));

/** The items on the invoice: the package, or each session; plus an adjustment if the amount paid differs. */
/**
 * The items on the invoice: the service with its number of sessions × the client's price (the session
 * dates listed under it), or the package; plus an adjustment if the amount differs.
 */
export function invoiceLines(
  service: string,
  total: number,
  pkg: { sessions: number } | null,
  sessions: { starts_at: Date; price_czk: number | null; late_cancelled: boolean }[],
): InvoiceLine[] {
  const what = itemName(service);
  const lines: InvoiceLine[] = [];
  if (pkg) lines.push({ text: `${what} – balíček / package of ${pkg.sessions} sessions`, amount: total });
  else {
    // One line per price, so a price change mid-month shows as two lines.
    const byPrice = new Map<number, typeof sessions>();
    for (const s of sessions) byPrice.set(s.price_czk ?? 0, [...(byPrice.get(s.price_czk ?? 0) ?? []), s]);
    for (const [price, group] of byPrice)
      lines.push({
        text: `${what}: ${group.length} × ${czk(price)}`,
        amount: price * group.length,
        detail: `Sezení / Sessions: ${group
          .map((s) => `${day(s.starts_at)}${s.late_cancelled ? " (pozdní zrušení / late cancellation)" : ""}`)
          .join(", ")}`,
      });
  }
  const sum = lines.reduce((a, l) => a + l.amount, 0);
  if (sum !== total) lines.push({ text: "Úprava ceny / Price adjustment", amount: total - sum });
  return lines;
}

/** Gathers what the invoice for a payment shows, giving it an invoice number if it has none yet. */
export async function loadInvoice(paymentId: string): Promise<InvoiceData> {
  const number = await issueInvoice(paymentId);
  const { rows } = await pool.query<{
    amount_czk: number;
    paid_on: string | null;
    due_on: string | null;
    period: string | null;
    request_id: string;
    method: string;
    invoiced_at: Date;
    service: string;
    first_name: string;
    full_name: string;
    email: string;
    billing_name: string;
    billing_address: string;
    billing_ico: string;
    billing_dic: string;
    address: string;
    package_sessions: number | null;
  }>(
    `SELECT p.amount_czk, to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on, to_char(p.due_on, 'YYYY-MM-DD') AS due_on,
       p.period, p.request_id, p.method, p.invoiced_at,
       r.service, r.first_name, r.full_name, r.email, r.billing_name, r.billing_address, r.billing_ico, r.billing_dic, r.address,
       (SELECT sessions FROM packages WHERE payment_id = p.id LIMIT 1) AS package_sessions
     FROM payments p JOIN support_requests r ON r.id = p.request_id WHERE p.id = $1`,
    [paymentId],
  );
  const p = rows[0];
  const { rows: sessions } = await pool.query<{ starts_at: Date; price_czk: number | null; late_cancelled: boolean }>(
    "SELECT starts_at, price_czk, late_cancelled FROM client_sessions WHERE payment_id = $1 ORDER BY starts_at",
    [paymentId],
  );
  const customer = [
    p.billing_name || p.full_name || p.first_name,
    ...(p.billing_address || p.address).split("\n").map((l) => l.trim()).filter(Boolean),
    p.billing_ico && `IČO: ${p.billing_ico}`,
    p.billing_dic && `DIČ: ${p.billing_dic}`,
  ].filter(Boolean) as string[];
  const supplier = await invoiceSettings();
  const variableSymbol = await ensureVariableSymbol(p.request_id);
  return {
    number,
    issuedOn: p.invoiced_at,
    paidOn: p.paid_on,
    dueOn: p.due_on,
    variableSymbol,
    period: p.period,
    sessionCount: p.package_sessions ?? sessions.length,
    qr:
      p.paid_on === null && supplier.iban
        ? qrPlatba({ iban: supplier.iban, amountCzk: p.amount_czk, variableSymbol, message: `Faktura ${number}` })
        : null,
    // An unpaid invoice is taxed on the earlier of its date and the last session it covers.
    taxDate: taxDate(p.paid_on ?? pragueDay(p.invoiced_at), p.package_sessions ? [] : sessions.map((x) => x.starts_at)),
    method: p.method,
    customer,
    lines: invoiceLines(p.service, p.amount_czk, p.package_sessions ? { sessions: p.package_sessions } : null, sessions),
    total: p.amount_czk,
    supplier,
  };
}

const pragueDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(d);

/**
 * The tax point (DUZP): the earlier of payment and supply. A package or a payment in advance is taxed
 * when paid; sessions paid for after they happened, on the day of the last one.
 */
export function taxDate(paidOn: string, sessionDates: Date[]): string {
  if (!sessionDates.length) return paidOn;
  const last = sessionDates.map(pragueDay).sort().pop()!;
  return last < paidOn ? last : paidOn;
}

const hal = (h: number) =>
  `${(h / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ")} Kč`;

const METHOD_CS: Record<string, string> = { "Bank transfer": "Bankovní převod", Cash: "Hotově", Card: "Kartou" };

/** Draws an A4 invoice. */
export async function renderInvoice(d: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(Buffer.from(LIBERATION_SANS_REGULAR, "base64"), { subset: true });
  const bold = await doc.embedFont(Buffer.from(LIBERATION_SANS_BOLD, "base64"), { subset: true });
  doc.setTitle(`Faktura ${d.number}`);
  doc.setAuthor(d.supplier.supplierName);
  const page = doc.addPage([595.28, 841.89]);
  const ink = rgb(0.13, 0.15, 0.2);
  const muted = rgb(0.42, 0.45, 0.5);
  const green = rgb(0.18, 0.45, 0.33);
  const L = 50;
  const R = 545;

  const text = (pg: PDFPage, s: string, x: number, y: number, o: { font?: PDFFont; size?: number; color?: typeof ink } = {}) =>
    pg.drawText(s, { x, y, font: o.font ?? regular, size: o.size ?? 10, color: o.color ?? ink });
  const right = (s: string, xr: number, y: number, font: PDFFont = regular, size = 10) =>
    text(page, s, xr - font.widthOfTextAtSize(s, size), y, { font, size });
  // Wraps text to a width; returns the lines.
  const wrap = (s: string, width: number, font: PDFFont = regular, size = 10) => {
    const out: string[] = [];
    let line = "";
    for (const word of s.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
    return out;
  };

  // Header
  const vatPayer = d.supplier.vatPayer;
  text(page, vatPayer ? "FAKTURA – DAŇOVÝ DOKLAD" : "FAKTURA", L, 780, { font: bold, size: vatPayer ? 18 : 22 });
  text(page, vatPayer ? "Tax invoice" : "Invoice", L, 762, { size: 11, color: muted });
  right(`č. / No. ${d.number}`, R, 780, bold, 14);
  right(`Datum vystavení / Issued: ${day(d.issuedOn)}`, R, 762);
  if (vatPayer) right(`DUZP / Tax point: ${isoDay(d.taxDate)}`, R, 748);

  // Supplier and customer
  let y = 715;
  text(page, "DODAVATEL / SUPPLIER", L, y, { font: bold, size: 8, color: muted });
  text(page, "ODBĚRATEL / CUSTOMER", 320, y, { font: bold, size: 8, color: muted });
  const s = d.supplier;
  const supplierLines = [
    s.supplierName,
    ...s.supplierAddress.split("\n").map((l) => l.trim()).filter(Boolean),
    s.ico && `IČO: ${s.ico}`,
    s.dic && `DIČ: ${s.dic}`,
    s.email,
    s.phone,
  ].filter(Boolean) as string[];
  let ys = y - 16;
  supplierLines.forEach((l, i) => {
    text(page, l, L, ys, { font: i === 0 ? bold : regular });
    ys -= 14;
  });
  let yc = y - 16;
  d.customer.forEach((l, i) => {
    for (const w of wrap(l, 225, i === 0 ? bold : regular)) {
      text(page, w, 320, yc, { font: i === 0 ? bold : regular });
      yc -= 14;
    }
  });
  y = Math.min(ys, yc) - 10;
  if (s.registration) {
    for (const w of wrap(s.registration, R - L, regular, 8)) {
      text(page, w, L, y, { size: 8, color: muted });
      y -= 11;
    }
  }

  // Payment box: how and when it was paid, or how to pay it (with a QR Platba code).
  const unpaid = d.paidOn === null;
  const boxH = unpaid && d.qr ? 104 : 66;
  y -= 14;
  page.drawRectangle({ x: L, y: y - boxH + 8, width: R - L, height: boxH, color: rgb(0.95, 0.97, 0.96) });
  const pay: [string, string][] = (
    [
      unpaid
        ? ["Způsob úhrady / Payment", "Bankovní převod / Bank transfer"]
        : ["Způsob úhrady / Payment", `${METHOD_CS[d.method] ?? d.method} / ${d.method}`],
      unpaid
        ? ["Datum splatnosti / Due date", d.dueOn ? isoDay(d.dueOn) : "—"]
        : ["Uhrazeno dne / Paid on", isoDay(d.paidOn!)],
      ["Variabilní symbol", d.variableSymbol],
      s.bankAccount ? ["Účet / Account", s.bankAccount] : null,
      s.iban ? ["IBAN", s.iban] : null,
    ] as ([string, string] | null)[]
  ).filter((x): x is [string, string] => !!x);
  pay.forEach(([k, v], i) => {
    const yy = y - 6 - i * 18;
    text(page, k, L + 10, yy, { size: 8, color: muted });
    text(page, v, L + 140, yy, { size: 9, font: i === 1 && unpaid ? bold : regular });
  });
  if (unpaid && d.qr) {
    // QR Platba: scanned in any Czech banking app, it fills in the account, amount and variable symbol.
    const qr = QRCode.create(d.qr, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const size = 88;
    const cell = size / n;
    const qx = R - size - 10;
    const qy = y - boxH + 14;
    page.drawRectangle({ x: qx - 4, y: qy - 4, width: size + 8, height: size + 8, color: rgb(1, 1, 1) });
    for (let row = 0; row < n; row++)
      for (let col = 0; col < n; col++)
        if (qr.modules.get(row, col))
          page.drawRectangle({ x: qx + col * cell, y: qy + (n - 1 - row) * cell, width: cell + 0.3, height: cell + 0.3, color: rgb(0, 0, 0) });
    right("QR Platba", qx - 10, qy + 4, bold, 8);
  }
  y -= boxH + 14;

  // What the invoice is for
  const months = d.period
    ? new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.period}-01T00:00:00Z`)) +
      " / " +
      new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.period}-01T00:00:00Z`))
    : null;
  text(page, `${months ? `Období / Period: ${months} · ` : ""}Počet sezení / Number of sessions: ${d.sessionCount}`, L, y, { size: 9 });
  y -= 22;

  // Items
  text(page, "Položka / Item", L, y, { font: bold, size: 9, color: muted });
  right(vatPayer ? "Cena s DPH / Price incl. VAT" : "Cena / Price", R, y, bold, 9);
  y -= 8;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.7, color: muted });
  y -= 16;
  let pg = page;
  for (const l of d.lines) {
    if (y < 120) {
      pg = doc.addPage([595.28, 841.89]);
      y = 780;
    }
    const ws = wrap(l.text, 380, bold);
    ws.forEach((w, i) => text(pg, w, L, y - i * 13, { font: bold }));
    const amt = czk(l.amount);
    text(pg, amt, R - regular.widthOfTextAtSize(amt, 10), y);
    y -= ws.length * 13;
    if (l.detail) {
      const ds = wrap(l.detail, 400, regular, 8);
      ds.forEach((w, i) => text(pg, w, L + 10, y - 2 - i * 11, { size: 8, color: muted }));
      y -= ds.length * 11 + 2;
    }
    y -= 8;
  }
  pg.drawLine({ start: { x: L, y: y + 2 }, end: { x: R, y: y + 2 }, thickness: 0.7, color: muted });
  y -= 18;
  if (vatPayer) {
    // VAT recap: rate, base, VAT and total, in crowns and haléře.
    const v = vatSplit(d.total, d.supplier.vatRate);
    const cols: [string, string][] = [
      ["Sazba DPH / VAT rate", `${d.supplier.vatRate} %`],
      ["Základ daně / Tax base", hal(v.base)],
      ["DPH / VAT", hal(v.vat)],
    ];
    for (const [k, val] of cols) {
      text(pg, k, 320, y, { size: 9, color: muted });
      text(pg, val, R - regular.widthOfTextAtSize(val, 10), y);
      y -= 15;
    }
    y -= 6;
  }
  const total = vatPayer ? hal(Math.round(d.total * 100)) : czk(d.total);
  text(pg, vatPayer ? "Celkem s DPH / Total incl. VAT" : "Celkem / Total", vatPayer ? 230 : 320, y, { font: bold, size: 12 });
  text(pg, total, R - bold.widthOfTextAtSize(total, 14), y, { font: bold, size: 14 });
  y -= 22;
  const status = unpaid
    ? `K ÚHRADĚ DO ${d.dueOn ? isoDay(d.dueOn) : ""} / PLEASE PAY BY ${d.dueOn ? isoDay(d.dueOn) : ""}, VS ${d.variableSymbol}`
    : "UHRAZENO – NEPLAŤTE / PAID – NOTHING TO PAY";
  text(pg, status, R - bold.widthOfTextAtSize(status, 10), y, { font: bold, size: 10, color: unpaid ? ink : green });

  // Footer note
  let yf = 70;
  const footer = vatPayer ? s.note : s.note || "Nejsme plátci DPH. / Not a VAT payer.";
  for (const w of wrap(footer, R - L, regular, 9)) {
    text(pg, w, L, yf, { size: 9, color: muted });
    yf -= 12;
  }
  return doc.save();
}

/** Several invoices in one PDF, e.g. a month's or a client's, for export. */
export async function renderInvoices(list: InvoiceData[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const d of list) {
    const one = await PDFDocument.load(await renderInvoice(d));
    for (const page of await out.copyPages(one, one.getPageIndices())) out.addPage(page);
  }
  return out.save();
}

/** The QR Platba code as a PNG, for attaching to the invoice email. */
export const qrPng = (text: string) => QRCode.toBuffer(text, { errorCorrectionLevel: "M", width: 360, margin: 2 });

/** A safe file name for the invoice. */
export const invoiceFileName = (number: string) => `faktura-${number.replace(/[^\w-]+/g, "-")}.pdf`;
