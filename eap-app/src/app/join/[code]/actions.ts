"use server";

import { redirect } from "next/navigation";
import { normalizeCompanyCode } from "@/lib/codes";
import { findCompanyByCode, insertRequest } from "@/lib/data";
import { autoAssign } from "@/lib/assign";
import { coordinatorEmails } from "@/lib/offers";
import { clientMessageLink } from "@/lib/messages";
import { employeeConfirmation, sendEmail, teamAlert, therapistAlert } from "@/lib/email";
import { validateRequest, type FieldErrors, type FormValues } from "@/lib/request-form";

export type SubmitState = {
  errors?: FieldErrors;
  values?: FormValues;
  formError?: string;
};

/** Handles the request form: an EAP request for the company code given, or a private one when code is null. */
export async function submitRequest(rawCode: string | null, _prev: SubmitState, formData: FormData): Promise<SubmitState> {
  let company: Awaited<ReturnType<typeof findCompanyByCode>> = null;
  if (rawCode !== null) {
    const code = normalizeCompanyCode(rawCode);
    company = code ? await findCompanyByCode(code) : null;
    if (!company || !company.active) {
      return { formError: "This company code is no longer active. Please check with your HR team." };
    }
  }
  const thanks = company ? `/join/${company.code}/thanks` : "/start/thanks";

  // Bots fill every field, people never see this one.
  if (formData.get("website")) redirect(thanks);

  const result = validateRequest(formData);
  if (!result.ok) return { errors: result.errors, values: result.values };

  const id = await insertRequest(company?.id ?? null, result.data);

  // The request is saved; a failed assignment or email must not make the person think it wasn't.
  // Private clients aren't offered automatically: the coordinator assigns them.
  let therapist = null;
  if (company) {
    try {
      therapist = (await autoAssign(id, result.data.language, result.data.crisis))?.therapist ?? null;
    } catch (err) {
      console.error("EAP auto-assign failed:", err);
    }
  }
  const mails = [
    teamAlert(company?.name ?? null, id, therapist?.name ?? null, result.data.crisis),
    employeeConfirmation(result.data.email, result.data.firstName, result.data.crisis, await clientMessageLink(id), !company),
  ];
  if (therapist) mails.push(therapistAlert(therapist.email, therapist.name, id, result.data.crisis));
  if (!company)
    for (const to of await coordinatorEmails())
      if (to !== process.env.TEAM_NOTIFY_EMAIL) mails.push(teamAlert(null, id, null, result.data.crisis, to));
  const sent = await Promise.allSettled(mails.map(sendEmail));
  for (const s of sent) if (s.status === "rejected") console.error("EAP email failed:", s.reason);

  redirect(`${thanks}${result.data.crisis ? "?urgent=1" : ""}`);
}
