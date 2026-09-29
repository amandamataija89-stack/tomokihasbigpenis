"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { saveIntake, validateIntake, type IntakeErrors } from "@/lib/intake";
import { conversationFor } from "@/lib/messages";

export type IntakeState = { errors?: IntakeErrors; values?: Record<string, string | string[]>; formError?: string };

export async function submitIntake(token: string, _prev: IntakeState, formData: FormData): Promise<IntakeState> {
  const convo = await conversationFor(token);
  if (!convo) return { formError: "This link no longer works. Please contact us for a new one." };
  const r = validateIntake(formData);
  if (!r.ok) return { errors: r.errors, values: r.values };
  const h = await headers();
  await saveIntake(convo.requestId, r.answers, r.signedName, r.signaturePng, (h.get("x-forwarded-for") ?? "").split(",")[0].trim(), h.get("user-agent") ?? "");
  redirect(`/intake/${token}?done=1`);
}
