"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { validateConsent } from "@/lib/consent";
import { memberForToken, saveGroupConsent } from "@/lib/group-consent";
import type { ConsentState } from "../../consent/[token]/actions";

export async function signGroupConsent(token: string, _prev: ConsentState, formData: FormData): Promise<ConsentState> {
  const m = await memberForToken(token);
  if (!m) return { formError: "This link no longer works. Please contact us for a new one." };
  const result = validateConsent(formData);
  if (!result.ok) return { errors: result.errors, values: result.values };
  const h = await headers();
  await saveGroupConsent(m, result.data, (h.get("x-forwarded-for") ?? "").split(",")[0].trim(), h.get("user-agent") ?? "");
  redirect(`/group-consent/${token}?signed=1`);
}
