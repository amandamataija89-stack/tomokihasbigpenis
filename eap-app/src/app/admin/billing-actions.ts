"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isManager, requireManager, requireStaff, type Staff } from "@/lib/auth";
import {
  billingFrom,
  deletePayment,
  invoiceSettings,
  parsePrice,
  PAYMENT_METHODS,
  recordPackage,
  recordPayment,
  saveInvoiceSettings,
  setListPrice,
  type InvoiceSettings,
} from "@/lib/billing";
import { pool } from "@/lib/db";
import { emailProblem, invoiceEmail, sendEmail } from "@/lib/email";
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

/** The client's own session price and their billing details. */
export async function saveClientBilling(requestId: string, formData: FormData) {
  const staff = await requirePrivateCase(requestId);
  const price = parsePrice(formData.get("sessionPrice"));
  if (price === undefined) back(requestId, "price");
  const b = billingFrom(formData);
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) back(requestId, "email");
  await pool.query(
    `UPDATE support_requests SET session_price_czk = $2, billing_name = $3, billing_address = $4, billing_ico = $5,
       billing_dic = $6, billing_email = $7, updated_at = now() WHERE id = $1`,
    [requestId, price ?? null, b.name, b.address, b.ico, b.dic, b.email],
  );
  await note(requestId, staff.id, "Billing details updated.");
  back(requestId, "saved");
}

/** One payment for several sessions at once (or just one). */
export async function recordSessionsPayment(requestId: string, formData: FormData) {
  const staff = await requirePrivateCase(requestId);
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
  const staff = await requirePrivateCase(requestId);
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
  const staff = await requirePrivateCase(requestId);
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

/** Emails the invoice PDF to the billing email, or the client's email. */
export async function emailInvoice(requestId: string, paymentId: string) {
  const staff = await requirePrivateCase(requestId);
  const { rows } = await pool.query<{ to: string; first_name: string }>(
    `SELECT COALESCE(NULLIF(r.billing_email, ''), r.email) AS to, r.first_name
     FROM payments p JOIN support_requests r ON r.id = p.request_id WHERE p.id = $1 AND p.request_id = $2`,
    [paymentId, requestId],
  );
  if (!rows[0]) back(requestId, "missing");
  // Loaded here so the fonts are only read when an invoice is actually made.
  const { invoiceFileName, loadInvoice, renderInvoice } = await import("@/lib/invoice-pdf");
  const data = await loadInvoice(paymentId);
  const pdf = await renderInvoice(data);
  try {
    await sendEmail(
      invoiceEmail(rows[0].to, rows[0].first_name, data.number, Buffer.from(pdf).toString("base64"), invoiceFileName(data.number)),
    );
  } catch (err) {
    console.error("EAP invoice email failed:", err);
    redirect(`/admin/requests/${requestId}?billing=emailfailed&why=${encodeURIComponent(emailProblem(err))}#payments`);
  }
  await note(requestId, staff.id, `Invoice ${data.number} emailed to ${rows[0].to}.`);
  back(requestId, "emailed");
}

const isDuplicateInvoice = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

// ---- Pricing and invoice settings (coordinators and admins) ------------------------------

export async function savePriceList(formData: FormData) {
  await requireManager();
  for (const service of SERVICES) {
    const price = parsePrice(formData.get(`price:${service}`));
    if (price === undefined) redirect("/admin/pricing?error=price");
    await setListPrice(service, price ?? null);
  }
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
    nextNumber,
    dueDays: Number.isInteger(dueDays) && dueDays >= 0 && dueDays <= 90 ? dueDays : current.dueDays,
  });
  revalidatePath("/admin/pricing");
  redirect("/admin/pricing?saved=invoice");
}
