"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { saveConsent, sendSignedCopy, latestConsent, validateConsent, type ConsentErrors } from "@/lib/consent";
import { conversationFor } from "@/lib/messages";

export type ConsentState = { errors?: ConsentErrors; values?: Record<string, string>; formError?: string };

export async function signConsent(token: string, _prev: ConsentState, formData: FormData): Promise<ConsentState> {
  const convo = await conversationFor(token);
  if (!convo) return { formError: "This link no longer works. Please contact us for a new one." };
  const result = validateConsent(formData);
  if (!result.ok) return { errors: result.errors, values: result.values };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  await saveConsent(convo.requestId, result.data, ip, h.get("user-agent") ?? "");
  // The form is saved; a failed email mustn't make the client think it wasn't.
  try {
    const signed = await latestConsent(convo.requestId);
    if (signed) await sendSignedCopy(signed, convo.requestId);
  } catch (err) {
    console.error("EAP consent copy email failed:", err);
  }
  redirect(`/consent/${token}?signed=1`);
}
