"use server";

import { redirect } from "next/navigation";
import { parseFeedback, submitFeedback } from "@/lib/feedback";

export type FeedbackState = { error?: string; values?: Record<string, string> };

export async function sendFeedback(token: string, _prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  // Echoed back on error so the client doesn't lose what they already answered.
  const values = Object.fromEntries(
    ["overall", "counsellorRating", "helped", "recommend", "comments"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = parseFeedback(formData);
  if (!parsed.ok) return { error: parsed.error, values };
  const ok = await submitFeedback(token, parsed.data);
  if (!ok) return { error: "This feedback link has already been used or has expired." };
  redirect("/feedback/thanks");
}
