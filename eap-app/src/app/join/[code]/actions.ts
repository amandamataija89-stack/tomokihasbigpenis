"use server";

import { redirect } from "next/navigation";
import { normalizeCompanyCode } from "@/lib/codes";
import { findCompanyByCode, insertRequest } from "@/lib/data";
import { employeeConfirmation, sendEmail, teamAlert } from "@/lib/email";
import { validateRequest, type FieldErrors, type RequestInput } from "@/lib/request-form";

export type SubmitState = {
  errors?: FieldErrors;
  values?: Partial<RequestInput>;
  formError?: string;
};

export async function submitRequest(rawCode: string, _prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const code = normalizeCompanyCode(rawCode);
  const company = code ? await findCompanyByCode(code) : null;
  if (!company || !company.active) {
    return { formError: "This company code is no longer active. Please check with your HR team." };
  }

  // Bots fill every field, people never see this one.
  if (formData.get("website")) redirect(`/join/${company.code}/thanks`);

  const result = validateRequest(formData);
  if (!result.ok) return { errors: result.errors, values: result.values };

  const id = await insertRequest(company.id, result.data);

  // The request is saved; a failed email must not make the person think it wasn't.
  const mails = [teamAlert(company.name, id), employeeConfirmation(result.data.email, result.data.firstName)];
  const sent = await Promise.allSettled(mails.map(sendEmail));
  for (const s of sent) if (s.status === "rejected") console.error("EAP email failed:", s.reason);

  redirect(`/join/${company.code}/thanks`);
}
