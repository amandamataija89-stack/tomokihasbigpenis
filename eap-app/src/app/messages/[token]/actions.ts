"use server";

import { redirect } from "next/navigation";
import { conversationFor, MAX_MESSAGE_LENGTH, sendClientMessage } from "@/lib/messages";
import { coordinatorEmails } from "@/lib/offers";

export async function replyAsClient(token: string, formData: FormData) {
  const convo = await conversationFor(token);
  if (!convo) redirect(`/messages/${token}`);
  const body = String(formData.get("message") ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!body) redirect(`/messages/${token}?empty=1#reply`);
  await sendClientMessage(convo.requestId, body, coordinatorEmails);
  redirect(`/messages/${token}?sent=1#reply`);
}
