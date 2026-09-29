"use server";

import { redirect } from "next/navigation";
import { isManager, requireStaff } from "@/lib/auth";
import { autoAssign } from "@/lib/assign";
import { pool } from "@/lib/db";
import { employeeConfirmation, sendEmail } from "@/lib/email";
import { clientMessageLink } from "@/lib/messages";
import { FORMATS, LANGUAGES, SERVICES } from "@/lib/request-form";

export type AddClientState = { error?: string; values?: Record<string, string> };

/** Adds a client who didn't register through the website (e.g. they phoned or emailed). */
export async function addClientAction(_prev: AddClientState, formData: FormData): Promise<AddClientState> {
  const me = await requireStaff();
  const manager = isManager(me);
  const t = (k: string, max = 200) => String(formData.get(k) ?? "").trim().slice(0, max);
  const values = {
    kind: t("kind", 10),
    companyId: t("companyId", 40),
    firstName: t("firstName", 80),
    fullName: t("fullName", 160),
    email: t("email").toLowerCase(),
    phone: t("phone", 40),
    address: t("address", 300),
    service: t("service", 60),
    language: t("language", 40),
    format: t("format", 40),
    message: t("message", 2000),
    counsellor: t("counsellor", 40),
    crisis: formData.get("crisis") === "yes" ? "yes" : "",
  };
  const fail = (error: string) => ({ error, values });
  const isPrivate = values.kind !== "eap";
  if (!values.firstName) return fail("Enter the name the client wants to be called.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return fail("Enter the client's email address.");
  if (isPrivate && values.fullName.split(/\s+/).filter(Boolean).length < 2) return fail("Enter the client's first name and surname (for invoices).");
  if (isPrivate && !(SERVICES as readonly string[]).includes(values.service)) return fail("Choose the type of counselling.");
  if (!(LANGUAGES as readonly string[]).includes(values.language)) return fail("Choose a language.");
  if (!(FORMATS as readonly string[]).includes(values.format)) return fail("Choose online, in person, or no preference.");
  if (formData.get("consent") !== "yes") return fail("Confirm the client agreed to be contacted and to their details being stored.");
  let companyId: string | null = null;
  if (!isPrivate) {
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM companies WHERE id = $1 AND active", [
      /^[0-9a-f-]{36}$/i.test(values.companyId) ? values.companyId : "00000000-0000-0000-0000-000000000000",
    ]);
    if (!rows[0]) return fail("Choose the client's company.");
    companyId = rows[0].id;
  }
  // Counsellors add clients for themselves; coordinators and admins choose (or leave it to the usual assignment).
  const counsellor = manager ? (/^[0-9a-f-]{36}$/i.test(values.counsellor) ? values.counsellor : null) : me.id;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO support_requests
       (kind, company_id, variable_symbol, first_name, full_name, email, phone, contact_method, language, format, topics,
        message, crisis, age_range, gender, location, service, address, consent_at, consent_contact_at,
        assigned_to, assigned_at, accepted_at, in_pool, added_by)
     VALUES ($1, $2, CASE WHEN $1 = 'private' THEN nextval('client_vs_seq')::text END, $3, $4, $5, $6, 'Email', $7, $8, '{}',
        $9, $10, '', '', '', $11, $12, now(), now(),
        $13, CASE WHEN $13::uuid IS NOT NULL THEN now() END, CASE WHEN $13::uuid IS NOT NULL THEN now() END,
        $13::uuid IS NULL AND $1 = 'private', $14)
     RETURNING id`,
    [
      isPrivate ? "private" : "eap", companyId, values.firstName, values.fullName, values.email, values.phone, values.language,
      values.format, values.message, values.crisis === "yes", isPrivate ? values.service : "", isPrivate ? values.address : "",
      counsellor, me.id,
    ],
  );
  const id = rows[0].id;
  await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
    id,
    me.id,
    `Client added by hand by ${me.name}${counsellor ? "" : ", waiting for a counsellor"}. The client agreed to be contacted and to their details being stored.`,
  ]);
  // An EAP client with nobody chosen is offered automatically, as if they'd registered.
  if (!counsellor && !isPrivate) await autoAssign(id, values.language, values.crisis === "yes").catch((err) => console.error(err));
  if (formData.get("welcome") === "yes")
    await sendEmail(employeeConfirmation(values.email, values.firstName, values.crisis === "yes", await clientMessageLink(id), isPrivate)).catch(
      (err) => console.error("EAP welcome email failed:", err),
    );
  redirect(`/admin/requests/${id}?added=1`);
}
