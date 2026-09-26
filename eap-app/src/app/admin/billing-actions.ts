"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isManager, requireManager, requireStaff, type Staff } from "@/lib/auth";
import {
  billingFrom,
  createInvoiceToPay,
  createMonthlyInvoices,
  deletePayment,
  addHeldSessionsToInvoices,
  addInvoiceItem,
  issueInvoice,
  markInvoicePaid,
  removeInvoiceItem,
  recomputeClientInvoices,
  removeFromInvoice,
  setInvoiceAmount,
  invoiceSettings,
  parsePrice,
  PAYMENT_METHODS,
  recordPackage,
  recordPayment,
  priceList,
  priceSteps,
  saveInvoiceSettings,
  setPriceRange,
  withVat,
  type InvoiceSettings,
} from "@/lib/billing";
import { pool } from "@/lib/db";
import { emailProblem } from "@/lib/email";
import { SERVICES } from "@/lib/request-form";

// Billing is for private clients, by staff who can see the case (their counsellor, coordinators, admins).
async function requirePrivateCase(requestId: string): Promise<Staff> {
  const staff = await requireStaff();
  const { rows } = await pool.query<{ assigned_to: string | null; kind: string }>(
    "SELECT assigned_to, kind FROM support_requests WHERE id = $1",
    [requestId],
  );
  const r = rows[0];
  if (!r || r.kind !== "private" || (!isManager(staff) && r.assigned_to !== staff.id)) redirect("/admin");
  return staff;
}

// Invoices and payments are handled by coordinators and admins; counsellors only see the amounts.
async function requireBillingManager(requestId: string): Promise<Staff> {
  const staff = await requirePrivateCase(requestId);
  if (!isManager(staff)) redirect(`/admin/requests/${requestId}`);
  return staff;
}

const note = (requestId: string, staffId: string, body: string) =>
  pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [requestId, staffId, body]);
const back = (requestId: string, flash: string) => redirect(`/admin/requests/${requestId}?billing=${flash}#payments`);
const czk = (n: number) => `${n.toLocaleString("cs-CZ")} CZK`;

const todayPrague = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
function dateFrom(form: FormData): string | null {
  const v = String(form.get("paidOn") ?? "").trim();
  if (!v) return todayPrague();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
}
const methodFrom = (form: FormData) => {
  const m = String(form.get("method") ?? "");
  return (PAYMENT_METHODS as readonly string[]).includes(m) ? m : "Bank transfer";
};
const invoiceNumberFrom = (form: FormData) => String(form.get("invoiceNumber") ?? "").trim().slice(0, 40) || null;

/** Step 1: the kind of support. A chosen price outside the new type's range is cleared, to be picked again. */
export async function setClientService(requestId: string, formData: FormData) {
  const staff = await requirePrivateCase(requestId);
  const service = String(formData.get("service") ?? "");
  if (!(SERVICES as readonly string[]).includes(service)) redirect(`/admin/requests/${requestId}?billing=service#price`);
  const { rows } = await pool.query<{ service: string; net: number | null }>(
    "SELECT service, session_price_net_czk AS net FROM support_requests WHERE id = $1",
    [requestId],
  );
  if (rows[0].service === service) redirect(`/admin/requests/${requestId}#price`);
  const range = (await priceList()).find((p) => p.service === service);
  const net = rows[0].net;
  const fits =
    net !== null && range?.min_net_czk != null && net >= range.min_net_czk && net <= (range.max_net_czk ?? range.min_net_czk);
  await pool.query(
    `UPDATE support_requests SET service = $2, updated_at = now(),
       session_price_net_czk = CASE WHEN $3 THEN session_price_net_czk END,
       session_price_czk = CASE WHEN $3 THEN session_price_czk END
     WHERE id = $1`,
    [requestId, service, fits],
  );
  await note(
    requestId,
    staff.id,
    `Type of counselling set to ${service}${rows[0].service ? ` (was ${rows[0].service})` : ""}.${net !== null && !fits ? " The price no longer fits its range: please choose it again." : ""}`,
  );
  redirect(`/admin/requests/${requestId}?billing=service-saved#price`);
}

/**
 * The counsellor picks the client's price (without VAT) from the range for their kind of support.
 * It's used for their new sessions, and for booked sessions not yet paid.
 */
export async function chooseClientPrice(requestId: string, formData: FormData) {
  const staff = await requirePrivateCase(requestId);
  const net = Number(formData.get("net"));
  const { rows } = await pool.query<{ service: string }>("SELECT service FROM support_requests WHERE id = $1", [requestId]);
  const range = (await priceList()).find((p) => p.service === rows[0]?.service);
  const allowed =
    range?.min_net_czk != null && range.max_net_czk != null ? priceSteps(range.min_net_czk, range.max_net_czk) : [];
  // Coordinators and admins may also type a price outside the range (e.g. a no-range service or a discount).
  const custom = isManager(staff) ? parsePrice(formData.get("customNet")) : null;
  const chosen = custom ?? (allowed.includes(net) ? net : undefined);
  if (chosen === undefined || chosen === null) redirect(`/admin/requests/${requestId}?billing=range#price`);
  const settings = await invoiceSettings();
  const gross = withVat(chosen!, settings);
  await pool.query(
    "UPDATE support_requests SET session_price_net_czk = $2, session_price_czk = $3, updated_at = now() WHERE id = $1",
    [requestId, chosen, gross],
  );
  const { rowCount } = await pool.query(
    "UPDATE client_sessions SET price_czk = $2 WHERE request_id = $1 AND paid_at IS NULL",
    [requestId, gross],
  );
  await recomputeClientInvoices(requestId); // unpaid invoices follow the new price
  await addHeldSessionsToInvoices(requestId); // completed sessions that were waiting for a price
  const vat = settings.vatPayer ? ` + ${settings.vatRate} % VAT = ${czk(gross)}` : "";
  await note(
    requestId,
    staff.id,
    `Price chosen: ${czk(chosen!)}${vat} per session.${rowCount ? ` Applied to ${rowCount} unpaid booked session${rowCount === 1 ? "" : "s"}.` : ""}`,
  );
  redirect(`/admin/requests/${requestId}?billing=pricechosen#price`);
}

/** Who the client's invoices are made out to. */
export async function saveClientBilling(requestId: string, formData: FormData) {
  const staff = await requireBillingManager(requestId);
  const b = billingFrom(formData);
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) back(requestId, "email");
  await pool.query(
    `UPDATE support_requests SET billing_name = $2, billing_address = $3, billing_ico = $4,
       billing_dic = $5, billing_email = $6, updated_at = now() WHERE id = $1`,
    [requestId, b.name, b.address, b.ico, b.dic, b.email],
  );
  await note(requestId, staff.id, "Billing details updated.");
  back(requestId, "saved");
}

/** One payment for several sessions at once (or just one). */
export async function recordSessionsPayment(requestId: string, formData: FormData) {
  const staff = await requireBillingManager(requestId);
  const sessionIds = formData.getAll("session").map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!sessionIds.length) back(requestId, "nosessions");
  const amount = parsePrice(formData.get("amount"));
  const paidOn = dateFrom(formData);
  if (amount === undefined) back(requestId, "amount");
  if (!paidOn) back(requestId, "date");
  try {
    const paid = await recordPayment({
      requestId,
      sessionIds,
      amount: amount ?? null,
      paidOn: paidOn!,
      method: methodFrom(formData),
      invoiceNumber: invoiceNumberFrom(formData),
      staffId: staff.id,
    });
    if (paid === null) back(requestId, "nosessions");
    await note(requestId, staff.id, `Payment recorded: ${czk(paid!)} for ${sessionIds.length} ${sessionIds.length === 1 ? "session" : "sessions"}.`);
  } catch (err) {
    if (isDuplicateInvoice(err)) back(requestId, "duplicate");
    throw err;
  }
  back(requestId, "paid");
}

/** A prepaid package of sessions. */
export async function recordPackagePayment(requestId: string, formData: FormData) {
  const staff = await requireBillingManager(requestId);
  const sessions = Number(formData.get("sessions"));
  const price = parsePrice(formData.get("packagePrice"));
  const paidOn = dateFrom(formData);
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 100) back(requestId, "sessions");
  if (price === undefined || price === null) back(requestId, "amount");
  if (!paidOn) back(requestId, "date");
  try {
    const covered = await recordPackage({
      requestId,
      sessions,
      price: price!,
      paidOn: paidOn!,
      method: methodFrom(formData),
      invoiceNumber: invoiceNumberFrom(formData),
      staffId: staff.id,
    });
    await note(
      requestId,
      staff.id,
      `Package paid: ${sessions} sessions for ${czk(price!)}.${covered ? ` Covers ${covered} session${covered === 1 ? "" : "s"} already booked.` : ""}`,
    );
  } catch (err) {
    if (isDuplicateInvoice(err)) back(requestId, "duplicate");
    throw err;
  }
  back(requestId, "package");
}

export async function removePayment(requestId: string, paymentId: string) {
  const staff = await requireBillingManager(requestId);
  const { rows } = await pool.query<{ amount_czk: number; invoice_number: string | null }>(
    "SELECT amount_czk, invoice_number FROM payments WHERE id = $1 AND request_id = $2",
    [paymentId, requestId],
  );
  if (rows[0] && (await deletePayment(requestId, paymentId)))
    await note(
      requestId,
      staff.id,
      `Payment of ${czk(rows[0].amount_czk)} deleted${rows[0].invoice_number ? ` (it had invoice ${rows[0].invoice_number})` : ""}. Its sessions are unpaid again.`,
    );
  back(requestId, "deleted");
}

/** Emails the invoice PDF (with the QR code if it's to pay) to the billing email, or the client's email. */
export async function emailInvoice(requestId: string, paymentId: string) {
  await requireBillingManager(requestId);
  const { rowCount } = await pool.query("SELECT 1 FROM payments WHERE id = $1 AND request_id = $2", [paymentId, requestId]);
  if (!rowCount) back(requestId, "missing");
  // Loaded here so the fonts are only read when an invoice is actually made.
  const { sendInvoice } = await import("@/lib/invoice-mail");
  try {
    await sendInvoice(paymentId);
  } catch (err) {
    console.error("EAP invoice email failed:", err);
    redirect(`/admin/requests/${requestId}?billing=emailfailed&why=${encodeURIComponent(emailProblem(err))}#payments`);
  }
  back(requestId, "emailed");
}

/** An invoice to pay for the ticked sessions, due in 14 days; emailed straight away if asked. */
export async function createInvoiceAction(requestId: string, formData: FormData) {
  return createInvoice(requestId, formData, false);
}

/** "Create invoice and download PDF": creates it without emailing and offers the PDF on the page. */
export async function createInvoiceAndDownloadAction(requestId: string, formData: FormData) {
  return createInvoice(requestId, formData, true);
}

async function createInvoice(requestId: string, formData: FormData, download: boolean) {
  const staff = await requireBillingManager(requestId);
  const sessionIds = formData.getAll("session").map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!sessionIds.length) back(requestId, "nosessions");
  const amount = parsePrice(formData.get("amount"));
  if (amount === undefined) back(requestId, "amount");
  // Without a typed amount, every ticked session needs a price, or the invoice would be for 0 CZK.
  if (amount === null) {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM client_sessions WHERE request_id = $1 AND id = ANY($2::uuid[]) AND price_czk IS NULL",
      [requestId, sessionIds],
    );
    if (rowCount) back(requestId, "noprice");
  }
  const id = await createInvoiceToPay({ requestId, sessionIds, amount: amount ?? null, staffId: staff.id });
  if (!id) back(requestId, "nosessions");
  const { rows } = await pool.query<{ invoice_number: string; amount_czk: number }>(
    "SELECT invoice_number, amount_czk FROM payments WHERE id = $1",
    [id],
  );
  await note(requestId, staff.id, `Invoice ${rows[0].invoice_number} issued for ${czk(rows[0].amount_czk)}, to pay within 14 days.`);
  // "Create invoice and download PDF": back to the page with the download button, without emailing it.
  if (download) redirect(`/admin/requests/${requestId}?billing=created&pdf=${id}#payments`);
  if (formData.get("send") === "yes") await emailOrFlag(requestId, id!);
  back(requestId, "invoiced");
}

// Emails an invoice; on failure, goes back to the page with the reason.
async function emailOrFlag(requestId: string, paymentId: string) {
  const { sendInvoice } = await import("@/lib/invoice-mail");
  try {
    await sendInvoice(paymentId);
  } catch (err) {
    console.error("EAP invoice email failed:", err);
    redirect(`/admin/requests/${requestId}?billing=emailfailed&why=${encodeURIComponent(emailProblem(err))}#payments`);
  }
}

/** Adds any line to an unpaid invoice (amount with VAT; a minus sign for a discount). */
export async function addItemAction(requestId: string, paymentId: string, formData: FormData) {
  const staff = await requireBillingManager(requestId);
  const description = String(formData.get("description") ?? "").trim().slice(0, 200);
  const raw = String(formData.get("itemAmount") ?? "").trim();
  const negative = raw.startsWith("-");
  const amount = parsePrice(raw.replace(/^-/, ""));
  if (!description || amount === undefined || amount === null) back(requestId, "item");
  const value = negative ? -amount! : amount!;
  await addInvoiceItem(paymentId, description, value);
  await note(requestId, staff.id, `Added to the invoice: ${description}, ${czk(value)}.`);
  back(requestId, "edited");
}

export async function removeItemAction(requestId: string, paymentId: string, itemId: string) {
  const staff = await requireBillingManager(requestId);
  await removeInvoiceItem(paymentId, itemId);
  await note(requestId, staff.id, "Removed a line from the invoice.");
  back(requestId, "edited");
}

/** Issues a running monthly invoice now (instead of on the 1st), and emails it if asked. */
export async function issueNowAction(requestId: string, paymentId: string, formData: FormData) {
  const staff = await requireBillingManager(requestId);
  const { rows } = await pool.query<{ amount_czk: number }>(
    "SELECT amount_czk FROM payments WHERE id = $1 AND request_id = $2 AND paid_on IS NULL AND invoice_number IS NULL",
    [paymentId, requestId],
  );
  if (!rows[0]) back(requestId, "missing");
  const number = await issueInvoice(paymentId);
  await note(requestId, staff.id, `Invoice ${number} issued early for ${czk(rows[0].amount_czk)}, to pay within 14 days.`);
  if (formData.get("send") === "yes") await emailOrFlag(requestId, paymentId);
  back(requestId, "invoiced");
}

export async function markPaidAction(requestId: string, paymentId: string, formData: FormData) {
  const staff = await requireBillingManager(requestId);
  const paidOn = dateFrom(formData);
  if (!paidOn) back(requestId, "date");
  if (await markInvoicePaid(requestId, paymentId, paidOn!, methodFrom(formData))) {
    const { rows } = await pool.query<{ invoice_number: string; amount_czk: number }>(
      "SELECT invoice_number, amount_czk FROM payments WHERE id = $1",
      [paymentId],
    );
    await note(requestId, staff.id, `Invoice ${rows[0].invoice_number} marked paid (${czk(rows[0].amount_czk)}).`);
  }
  back(requestId, "markedpaid");
}

/** After checking the bank statement: emails the client a payment reminder with the QR code. */
export async function sendReminderAction(requestId: string, paymentId: string) {
  await requireBillingManager(requestId);
  const { rowCount } = await pool.query("SELECT 1 FROM payments WHERE id = $1 AND request_id = $2 AND paid_on IS NULL", [paymentId, requestId]);
  if (!rowCount) back(requestId, "missing");
  const { sendPaymentReminder } = await import("@/lib/invoice-mail");
  try {
    await sendPaymentReminder(paymentId);
  } catch (err) {
    console.error("EAP payment reminder failed:", err);
    redirect(`/admin/requests/${requestId}?billing=emailfailed&why=${encodeURIComponent(emailProblem(err))}#payments`);
  }
  back(requestId, "reminded");
}

/** A coordinator sets an unpaid invoice's amount; empty lets it follow the sessions again. */
export async function setInvoiceAmountAction(requestId: string, paymentId: string, formData: FormData) {
  const staff = await requireBillingManager(requestId);
  const amount = parsePrice(formData.get("invoiceAmount"));
  if (amount === undefined) back(requestId, "amount");
  const { rowCount } = await pool.query("SELECT 1 FROM payments WHERE id = $1 AND request_id = $2 AND paid_on IS NULL", [paymentId, requestId]);
  if (!rowCount) back(requestId, "missing");
  await setInvoiceAmount(paymentId, amount ?? null);
  await note(requestId, staff.id, amount === null ? "Invoice amount set back to follow its sessions." : `Invoice amount set to ${czk(amount!)}.`);
  back(requestId, "edited");
}

/** Takes one session off its unpaid invoice. */
export async function takeOffInvoiceAction(requestId: string, sessionId: string) {
  const staff = await requireBillingManager(requestId);
  await removeFromInvoice(sessionId);
  await note(requestId, staff.id, "Session taken off its invoice.");
  redirect(`/admin/requests/${requestId}#sessions`);
}

// ---- Bank statement (coordinators and admins) ---------------------------------------------

/** Reads an uploaded bank statement CSV and marks matching invoices paid. The result shows on Monthly billing. */
export async function importStatementAction(formData: FormData) {
  await requireManager();
  const file = formData.get("statement");
  if (!(file instanceof File) || file.size === 0) redirect("/admin/billing?bank=nofile");
  if ((file as File).size > 5_000_000) redirect("/admin/billing?bank=toobig");
  const { decodeStatement, importStatement, parseStatement } = await import("@/lib/bank-statement");
  let result;
  try {
    const transactions = parseStatement(decodeStatement(new Uint8Array(await (file as File).arrayBuffer())));
    result = await importStatement(transactions);
  } catch (err) {
    const why = err instanceof Error ? err.message : "The file couldn't be read.";
    redirect(`/admin/billing?bank=error&why=${encodeURIComponent(why.slice(0, 300))}`);
  }
  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ('last_bank_import', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({ at: new Date().toISOString(), ...result })],
  );
  revalidatePath("/admin/billing");
  redirect("/admin/billing?bank=done#bank");
}

// ---- Monthly invoicing (coordinators and admins) -------------------------------------------

const monthOf = (form: FormData) => {
  const m = String(form.get("month") ?? "");
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
};

/** One invoice per private client for the month's sessions not yet paid or invoiced. */
export async function createMonthlyInvoicesAction(formData: FormData) {
  const staff = await requireManager();
  const month = monthOf(formData);
  if (!month) redirect("/admin/billing");
  const { created, updated, withoutPrice } = await createMonthlyInvoices(month!, staff.id);
  for (const c of created)
    await note(c.requestId, staff.id, `Monthly invoice for ${month} issued: ${c.sessions} session${c.sessions === 1 ? "" : "s"}, ${czk(c.amount)}.`);
  redirect(`/admin/billing?month=${month}&created=${created.length + updated.length}&noprice=${withoutPrice.length}`);
}

/** Emails every invoice for the month that's still to pay and hasn't been emailed yet. */
export async function emailMonthlyInvoicesAction(formData: FormData) {
  await requireManager();
  const month = monthOf(formData);
  if (!month) redirect("/admin/billing");
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM payments WHERE period = $1 AND paid_on IS NULL AND emailed_at IS NULL AND invoice_number IS NOT NULL",
    [month],
  );
  const { sendInvoice } = await import("@/lib/invoice-mail");
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await sendInvoice(r.id);
      sent++;
    } catch (err) {
      console.error("EAP invoice email failed:", err);
      failed++;
    }
  }
  redirect(`/admin/billing?month=${month}&emailed=${sent}&failed=${failed}`);
}

const isDuplicateInvoice = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

// ---- Pricing and invoice settings (coordinators and admins) ------------------------------

export async function savePriceList(formData: FormData) {
  await requireManager();
  const ranges = SERVICES.map((service) => {
    const min = parsePrice(formData.get(`min:${service}`));
    const max = parsePrice(formData.get(`max:${service}`)) ?? min;
    return { service, min, max: max ?? null };
  });
  // A single price is fine (leave "to" empty); a range must run from low to high.
  if (ranges.some((r) => r.min === undefined || r.max === undefined || (r.min !== null && r.max !== null && r.max < r.min)))
    redirect("/admin/pricing?error=price");
  for (const r of ranges) await setPriceRange(r.service, r.min ?? null, r.max ?? null);
  revalidatePath("/admin/pricing");
  redirect("/admin/pricing?saved=prices");
}

export async function saveInvoiceSettingsAction(formData: FormData) {
  await requireManager();
  const current = await invoiceSettings();
  const t = (k: keyof InvoiceSettings, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const dueDays = Number(formData.get("dueDays"));
  const nextNumber = t("nextNumber", 40);
  if (!/\d$/.test(nextNumber)) redirect("/admin/pricing?error=number");
  await saveInvoiceSettings({
    ...current,
    supplierName: t("supplierName", 200) || current.supplierName,
    supplierAddress: t("supplierAddress", 500),
    ico: t("ico", 20),
    dic: t("dic", 20),
    bankAccount: t("bankAccount", 60),
    iban: t("iban", 60),
    registration: t("registration", 300),
    email: t("email", 200),
    phone: t("phone", 60),
    note: t("note", 500),
    vatPayer: formData.get("vatPayer") === "yes",
    vatRate: [0, 12, 21].includes(Number(formData.get("vatRate"))) ? Number(formData.get("vatRate")) : current.vatRate,
    nextNumber,
    dueDays: Number.isInteger(dueDays) && dueDays >= 0 && dueDays <= 90 ? dueDays : current.dueDays,
  });
  revalidatePath("/admin/pricing");
  redirect("/admin/pricing?saved=invoice");
}
