// Sends mail through Resend (the same provider the outreach scripts use).
// Without RESEND_API_KEY the message is logged instead, for local development.
import { appUrl } from "./app-url";

type Attachment = { filename: string; content: string }; // content: base64
type Mail = { to: string; subject: string; text: string; attachments?: Attachment[] };

/**
 * The Resend key from RESEND_API_KEY. Tolerates a key pasted with extras around it
 * (spaces, quotes, line breaks, or "RESEND_API_KEY=" in front) by picking out the re_… part.
 */
export function resendKey(raw = process.env.RESEND_API_KEY): string | undefined {
  if (!raw) return undefined;
  return raw.match(/re_[A-Za-z0-9_-]+/)?.[0] ?? raw.replace(/["'\s]/g, "");
}

/** Enough to tell which key is in use without revealing it: its first characters and length. */
export function keyHint(key = resendKey()): string {
  if (!key) return "RESEND_API_KEY is empty in Vercel.";
  if (!key.startsWith("re_")) return `The RESEND_API_KEY in Vercel doesn't start with "re_" (it's ${key.length} characters), so it isn't a Resend API key.`;
  return `The key Vercel is using starts with "${key.slice(0, 6)}" and is ${key.length} characters long.`;
}

export async function sendEmail({ to, subject, text, attachments }: Mail): Promise<void> {
  const key = resendKey();
  const from = process.env.EMAIL_FROM ?? "Prague Integration <contact@pragueintegration.cz>";
  if (!key) {
    const files = attachments?.length ? `\n[attachments: ${attachments.map((a) => a.filename).join(", ")}]` : "";
    console.info(`[email not sent: RESEND_API_KEY unset] to=${to} subject=${subject}\n${text}${files}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, ...(attachments?.length ? { attachments } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
}

/** Plain-English reason an email couldn't be sent, safe to show to staff (never includes the key). */
export function emailProblem(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const status = Number(msg.match(/Resend returned (\d+)/)?.[1]);
  // Resend's own words, minus anything that looks like a key.
  const said = (msg.match(/"message"\s*:\s*"([^"]*)"/)?.[1] ?? msg).replace(/re_[A-Za-z0-9_-]+/g, "[key]").slice(0, 300);
  if (status === 401 || /api key is invalid|missing api key/i.test(msg))
    return `Resend didn't accept the RESEND_API_KEY in Vercel (Resend said: "${said}"). ${keyHint()} Compare that with the start of the key in Resend's API keys list. If they differ, paste the right key into Vercel and redeploy.`;
  if (/domain is not verified|not verified/i.test(msg))
    return "Resend says the sending domain isn't verified yet. Check it shows Verified in Resend, then try again.";
  if (status === 403)
    return "Resend refused to send: the API key may be limited to a different domain, or have no sending permission. Create a new key with Sending access for pragueintegration.cz.";
  if (status === 429) return "Resend is busy (too many emails at once). Wait a minute and try again.";
  return `The email couldn't be sent. Resend said: "${said}"`;
}


// Deliberately contains nothing the person wrote: email is not where health information should travel.
/** companyName is null for a private client, who always needs a counsellor assigning. */
export function teamAlert(
  companyName: string | null,
  requestId: string,
  assignedName: string | null,
  crisis: boolean,
  to = process.env.TEAM_NOTIFY_EMAIL ?? "contact@pragueintegration.cz",
): Mail {
  const who = assignedName ? `Assigned automatically to: ${assignedName}` : "Not assigned: someone needs to pick this up.";
  const urgent = crisis ? "URGENT: the person says they need help urgently. Contact them as soon as possible.\n\n" : "";
  const what = companyName ? `New EAP request (${companyName})` : "New private client";
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}${what}${assignedName ? "" : " – needs assigning"}`,
    text: `${urgent}A new support request has come in.\n\n${companyName ? `Company: ${companyName}` : "Private client (not through an employer)"}\n${who}\n\nOpen it here to see the details and make contact within 24 working hours:\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

const deadlineFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Prague",
});
export const formatDeadline = (d: Date) => deadlineFmt.format(d);

export function therapistAlert(to: string, therapistName: string, requestId: string, crisis = false, respondBy?: Date): Mail {
  const by = respondBy ? formatDeadline(respondBy) : null;
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}New client offered to you: please accept or decline`,
    text: `Hi ${therapistName},\n\nA new client has been offered to you.${
      crisis ? " They say they need help urgently." : ""
    }\n\nPlease open it and press Accept or Decline${by ? ` by ${by} (Prague time)` : ""}. If you don't answer by then, the client is passed to the next available counsellor.${
      crisis ? " Once you accept, contact them as soon as possible today." : " Once you accept, please contact them as soon as you can: they were promised contact within 24 working hours of asking."
    }\n\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

export function offerReminder(to: string, therapistName: string, requestId: string, crisis: boolean, respondBy: Date): Mail {
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}Reminder: please accept or decline your new client`,
    text: `Hi ${therapistName},\n\nA new client offered to you is still waiting for your answer. Please sign in and press Accept or Decline by ${formatDeadline(respondBy)} (Prague time). After that the client is passed to the next available counsellor.\n\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

export function offerReleased(to: string, therapistName: string, clientNickname: string, reason: "declined" | "no-reply"): Mail {
  return {
    to,
    subject: `${clientNickname} has been passed to another counsellor`,
    text: `Hi ${therapistName},\n\n${
      reason === "no-reply"
        ? `The offer of ${clientNickname} wasn't answered in time, so it has been passed to another counsellor.`
        : `Thanks for letting us know. ${clientNickname} has been passed to another counsellor.`
    } You don't need to do anything.\n`,
  };
}

export function nobodyAvailable(to: string, clientNickname: string, requestId: string, crisis: boolean, isPrivate = false): Mail {
  if (isPrivate)
    return {
      to,
      subject: `${crisis ? "URGENT – " : ""}Private client ${clientNickname} needs a new counsellor`,
      text: `${clientNickname}${crisis ? ", who said they need help urgently," : ""} (a private client) was declined or not accepted in time. Private clients aren't offered automatically, so please assign another counsellor:\n${appUrl()}/admin/requests/${requestId}\n`,
    };
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}No counsellor available for ${clientNickname}`,
    text: `${clientNickname}${crisis ? ", who said they need help urgently," : ""} was declined or not accepted in time, and no other counsellor is available right now (everyone is full, away, or has already passed on them).\n\nThe app will offer them automatically as soon as someone becomes available, but please assign them now if you can:\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

export type Digest = { pool: number; crisisInPool: number; awaiting: number; overdue: number };

export function dailyDigest(to: string, d: Digest): Mail {
  const lines = [
    `Clients waiting for a counsellor: ${d.pool}${d.crisisInPool ? ` (${d.crisisInPool} crisis)` : ""}`,
    `Offers waiting for a counsellor to accept: ${d.awaiting}`,
    `Not contacted by the promised time: ${d.overdue}`,
  ];
  return {
    to,
    subject: `EAP daily summary: ${d.pool} in the pool`,
    text: `Good morning,\n\n${lines.join("\n")}\n\nAssign clients from the pool here:\n${appUrl()}/admin?status=pool\n`,
  };
}

export function staffInvite(to: string, name: string, token: string, invitedBy: string): Mail {
  return {
    to,
    subject: "Your login for the Prague Integration EAP system",
    text: `Hi ${name},\n\n${invitedBy} has added you to the Prague Integration EAP system, where you'll see the clients assigned to you and book their sessions.\n\nChoose your password here (the link works once and expires in 7 days):\n${appUrl()}/admin/set-password/${token}\n\nAfter that, sign in at ${appUrl()}/admin with this email address.\n`,
  };
}

export function passwordReset(to: string, name: string, token: string): Mail {
  return {
    to,
    subject: "Reset your password – Prague Integration EAP",
    text: `Hi ${name},\n\nSomeone asked to reset the password for this email address. To choose a new one, open this link within 1 hour:\n${appUrl()}/admin/set-password/${token}\n\nIf it wasn't you, ignore this email: your password hasn't changed.\n`,
  };
}

// How the client reaches us in writing: their private conversation page.
const messageLine = (link?: string) =>
  link ? `\n\nTo write to us, or to read and answer our messages, use your private page:\n${link}\n(Keep this link to yourself: anyone with it can read your messages.)` : "";

export function employeeConfirmation(to: string, firstName: string, crisis = false, messageLink?: string, isPrivate = false): Mail {
  return {
    to,
    subject: "We've received your request – Prague Integration",
    text: `Hi ${firstName},\n\nThank you for reaching out. We've received your request and someone from our team will contact you ${crisis ? "as soon as possible" : "within 24 working hours (Monday to Friday)"}, in the way you asked.${messageLine(messageLink)}\n\nEverything you share with us is confidential.${isPrivate ? "" : " Your employer is not told who uses the programme."}\n\nIf you need urgent help before we reach you, call 112 (emergency) or the Linka první psychické pomoci on 116 123 (free, 24/7).\n\nPrague Integration\n+420 608 573 256\ncontact@pragueintegration.cz\n`,
  };
}

export type SessionEmail = {
  messageLink?: string; // the client's private conversation page
  lateCancelHours?: number; // include the cancellation policy (first booking and reminders)
  to: string;
  firstName: string;
  kind: "booked" | "moved" | "cancelled";
  when: string; // e.g. "Tuesday 30 September 2026 at 14:00"
  number: number;
  total: number | null; // null: no session limit (private clients)
  format: string;
  therapistName: string | null;
  // Private clients: how to pay for this session (QR code attached), within 24 hours after it.
  payment?: { amount: number; variableSymbol: string; account: string; iban: string; qrPngBase64: string };
  discovery?: boolean; // the free discovery session
  intakeLink?: string; // sent with the discovery session invitation
};

// What a late cancellation costs: one of the EAP sessions, or the full fee for a private client.
const lateCancelCost = (total: number | null) =>
  total ? `counts as one of your ${total} sessions` : "is charged as a session";
const sessionOf = (n: number, total: number | null) => (total ? `Session ${n} of ${total}` : `Session ${n}`);

export const lateCancellationPolicy = (hours: number, total: number | null) =>
  `Cancellation policy: if you need to cancel or move a session, please tell us at least ${hours} hours before it starts. A session cancelled with less notice ${lateCancelCost(total)}.`;

/** Where the session happens. The free discovery session is always online; other sessions follow the client's choice. */
export function whereText(format: string, discovery?: boolean): string {
  if (discovery || format === "Online") return "Where: online. Your therapist will send you the details for joining.";
  if (format === "In person in Prague") return "Where: Prague Integration, Mezibranská 4, 110 00 Prague 1";
  return "";
}

// Contains only practical details, nothing about why the person is coming.
export function sessionConfirmation(s: SessionEmail): Mail {
  const where = whereText(s.format, s.discovery) || "Your therapist will let you know whether you'll meet online or in person.";
  const withWhom = s.therapistName ? ` with ${s.therapistName}` : "";
  const subject = {
    booked: s.discovery ? `Your free discovery session: ${s.when}` : `Your session is booked: ${s.when}`,
    moved: `Your session has moved: ${s.when}`,
    cancelled: `Your session on ${s.when} is cancelled`,
  }[s.kind];
  const lead = {
    booked: s.discovery ? `your free discovery session${withWhom} is booked for:` : `your session${withWhom} is booked for:`,
    moved: `your session${withWhom} has moved to:`,
    cancelled: `your session${withWhom} on the date below has been cancelled:`,
  }[s.kind];
  const policy = s.lateCancelHours ? `\n\n${lateCancellationPolicy(s.lateCancelHours, s.total)}` : "";
  const intake = s.intakeLink
    ? `\n\nBefore we meet, please fill in our intake & registration form (about 10 minutes):\n${s.intakeLink}\n(Keep this link to yourself.)`
    : "";
  const pay = s.payment
    ? `\n\nPayment: ${s.payment.amount.toLocaleString("cs-CZ")} CZK, within 24 hours after the session, to account ${s.payment.account}${s.payment.iban ? ` (IBAN ${s.payment.iban})` : ""} with variable symbol ${s.payment.variableSymbol}. The attached QR code fills this in for you in your banking app.`
    : "";
  const body =
    s.kind === "cancelled"
      ? `\n\nWe'll be in touch to find a new time.`
      : `\n${s.discovery ? "Free of charge" : sessionOf(s.number, s.total)}\n${where}${policy}${intake}${pay}`;
  return {
    attachments: s.payment && s.kind !== "cancelled" ? [{ filename: "qr-platba.png", content: s.payment.qrPngBase64 }] : undefined,
    to: s.to,
    subject: `${subject} – Prague Integration`,
    text: `Hi ${s.firstName},\n\n${lead[0].toUpperCase()}${lead.slice(1)}\n\n${s.when} (Prague time)${body}\n\nIf you need to change the time, ${s.messageLink ? `message us on your private page (${s.messageLink})` : "reply to this email"} or call +420 608 573 256.\n\nPrague Integration\ncontact@pragueintegration.cz\n`,
  };
}

export function overdueWarning(
  to: string,
  counsellorName: string,
  clientNickname: string,
  requestId: string,
  contactBy: string,
  crisis: boolean,
): Mail {
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}Reminder: please contact ${clientNickname} by ${contactBy}`,
    text: `Hi ${counsellorName},\n\n${clientNickname}${crisis ? ", who said they need help urgently," : ""} was promised first contact by ${contactBy} (Prague time) and is still marked New.\n\nPlease contact them ${crisis ? "right away" : "today"}, then book their first session or set the case to Contacted:\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

export function contactMissed(to: string, clientNickname: string, requestId: string, counsellorName: string | null, crisis: boolean): Mail {
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}Contact promise missed: ${clientNickname}`,
    text: `${clientNickname}${crisis ? " (crisis)" : ""} was promised first contact within ${crisis ? "2 hours" : "24 working hours"} and the case is still New. ${
      counsellorName ? `It's with ${counsellorName}.` : "No counsellor has it yet."
    }\n\nPlease check on it now:\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

export function feedbackInvitation(to: string, firstName: string, token: string): Mail {
  return {
    to,
    subject: "How did it go? Anonymous feedback – Prague Integration",
    text: `Hi ${firstName},\n\nThank you for working with us. We'd be grateful for your feedback: it takes about two minutes and helps us improve.\n\n${appUrl()}/feedback/${token}\n\nYour answers are anonymous: we don't store your name or email with them, and your counsellor doesn't see them. The link works once and expires in 60 days.\n\nPrague Integration\n`,
  };
}

export function sessionReminder(s: Omit<SessionEmail, "kind"> & { cancelBy: string; lateCancelHours: number; final?: boolean }): Mail {
  const where = whereText(s.format, s.discovery);
  const contact = `${s.messageLink ? `message us on your private page (${s.messageLink})` : "reply to this email"} or call +420 608 573 256`;
  const session = s.discovery ? "free discovery session" : "session";
  return {
    to: s.to,
    subject: `${s.final ? "Tomorrow" : "Reminder"}: your ${session} on ${s.when} – Prague Integration`,
    text: `Hi ${s.firstName},\n\n${s.final ? "Just a reminder: your" : "A reminder of your upcoming"} ${session}${s.therapistName ? ` with ${s.therapistName}` : ""}${s.final ? " is tomorrow" : ""}:\n\n${s.when} (Prague time)\n${s.discovery ? "Free of charge" : sessionOf(s.number, s.total)}${where ? `\n${where}` : ""}\n\n${
      s.discovery
        ? `If you need to cancel or move it, please ${contact}.`
        : s.final
          ? `If you can't come, please ${contact} as soon as possible. As it's now less than ${s.lateCancelHours} hours away, a cancellation ${lateCancelCost(s.total)}.`
          : `If you need to cancel or move it, please tell us by ${s.cancelBy}: ${contact}. After that, a cancellation ${lateCancelCost(s.total)}.`
    }\n\nSee you soon,\nPrague Integration\n`,
  };
}

// Message notifications carry no message text: it stays in the app.
export function newMessageForClient(to: string, firstName: string, counsellorName: string | null, link: string): Mail {
  return {
    to,
    subject: `New message from ${counsellorName ?? "Prague Integration"}`,
    text: `Hi ${firstName},\n\n${counsellorName ?? "Your counsellor"} from Prague Integration has sent you a message. Read it and reply on your private page:\n${link}\n\nFor your privacy, messages aren't included in emails. Please reply on the page rather than to this email.\n\nPrague Integration\n`,
  };
}

export function newReplyForStaff(to: string, staffName: string, clientNickname: string, requestId: string): Mail {
  return {
    to,
    subject: `New message from ${clientNickname}`,
    text: `Hi ${staffName},\n\n${clientNickname} has sent a message. Sign in to read and answer it:\n${appUrl()}/admin/requests/${requestId}#messages\n`,
  };
}

export type InvoiceEmailInfo = {
  number: string;
  amount: number;
  paid: boolean;
  dueOn: string | null; // e.g. "14. 11. 2026"
  variableSymbol: string;
  account: string;
  iban: string;
};

const payLines = (i: InvoiceEmailInfo) =>
  `Částka / Amount: ${i.amount.toLocaleString("cs-CZ")} Kč\nÚčet / Account: ${i.account}${i.iban ? `\nIBAN: ${i.iban}` : ""}\nVariabilní symbol / Variable symbol: ${i.variableSymbol}${i.dueOn ? `\nSplatnost / Due date: ${i.dueOn}` : ""}\n\nNebo naskenujte QR kód v příloze ve své bankovní aplikaci.\nOr scan the attached QR code in your banking app.`;

/** The invoice PDF, and for an invoice to pay, how to pay it with the QR code attached as an image. */
export function invoiceEmail(
  to: string,
  firstName: string,
  info: InvoiceEmailInfo,
  pdfBase64: string,
  filename: string,
  qrPngBase64?: string,
): Mail {
  const attachments: Attachment[] = [{ filename, content: pdfBase64 }];
  if (qrPngBase64) attachments.push({ filename: `qr-platba-${info.number}.png`, content: qrPngBase64 });
  const body = info.paid
    ? `v příloze posíláme fakturu č. ${info.number}. Je již uhrazena, nic dalšího neplaťte.\nPlease find attached invoice no. ${info.number}. It has already been paid: there is nothing more to pay.`
    : `v příloze posíláme fakturu č. ${info.number}. Prosíme o úhradu do ${info.dueOn}.\nPlease find attached invoice no. ${info.number}, due by ${info.dueOn}.\n\n${payLines(info)}`;
  return {
    to,
    subject: `Faktura / Invoice ${info.number} – Prague Integration`,
    text: `Dobrý den / Hello ${firstName},\n\n${body}\n\nDěkujeme / Thank you,\nPrague Integration\n+420 608 573 256\ncontact@pragueintegration.cz\n`,
    attachments,
  };
}

/** Sent once when an invoice is past its due date. */
export function invoiceOverdueEmail(to: string, firstName: string, info: InvoiceEmailInfo, qrPngBase64?: string): Mail {
  return {
    to,
    subject: `Připomínka platby / Payment reminder: faktura ${info.number} – Prague Integration`,
    text: `Dobrý den / Hello ${firstName},\n\nfaktura č. ${info.number} byla splatná ${info.dueOn} a zatím jsme neobdrželi platbu. Pokud jste již zaplatili, děkujeme a tuto zprávu prosím ignorujte.\nInvoice no. ${info.number} was due on ${info.dueOn} and we haven't received the payment yet. If you've already paid, thank you, and please ignore this message.\n\n${payLines({ ...info, dueOn: null })}\n\nDěkujeme / Thank you,\nPrague Integration\n+420 608 573 256\ncontact@pragueintegration.cz\n`,
    attachments: qrPngBase64 ? [{ filename: `qr-platba-${info.number}.png`, content: qrPngBase64 }] : undefined,
  };
}

/** Tells the coordinator which invoices have just become overdue. */
export function overdueInvoicesAlert(to: string, list: { firstName: string; number: string; amount: number; dueOn: string }[]): Mail {
  return {
    to,
    subject: `Overdue invoices: ${list.length}`,
    text: `These invoices are past their due date and not marked paid. Please check the bank statement (upload it on Monthly billing: paid invoices are marked automatically). For any still unpaid, press "Send payment reminder" on the client's page.\n\n${list
      .map((l) => `${l.firstName}: invoice ${l.number}, ${l.amount.toLocaleString("cs-CZ")} CZK, due ${l.dueOn}`)
      .join("\n")}\n\nSee them on Monthly billing:\n${appUrl()}/admin/billing\n`,
  };
}

/** To a counsellor near the end of the month: admin to finish before invoices are made on the 1st. */
export function monthEndReminder(
  to: string,
  name: string,
  monthLabel: string,
  items: { pastUnmarked: number; noType: number; noPrice: number; noConsent: number },
): Mail {
  const lines = [
    items.pastUnmarked && `${items.pastUnmarked} past session${items.pastUnmarked === 1 ? "" : "s"} not marked done, late-cancelled or removed`,
    items.noType && `${items.noType} private client${items.noType === 1 ? "" : "s"} without a type of counselling`,
    items.noPrice && `${items.noPrice} private client${items.noPrice === 1 ? "" : "s"} without a price`,
    items.noConsent && `${items.noConsent} client${items.noConsent === 1 ? " hasn't" : "s haven't"} signed the consent form (resend the link from their page)`,
  ].filter(Boolean);
  return {
    to,
    subject: `Please finish ${monthLabel}'s admin by the end of the month`,
    text: `Hi ${name},\n\nInvoices for ${monthLabel} are created automatically on the 1st, from what's in the app. Please finish these by the end of the month:\n\n${lines
      .map((l) => `- ${l}`)
      .join("\n")}\n\nYou'll find them at the top of My clients:\n${appUrl()}/admin\n`,
  };
}

/** To the admin, once invoices for the month have gone out: the month's invoices as PDF and CSV. */
export function monthlyExportEmail(to: string, monthLabel: string, count: number, pdfBase64: string, csvBase64: string, month: string): Mail {
  return {
    to,
    subject: `Invoices for ${monthLabel}: ${count}`,
    text: `The invoices for ${monthLabel} have been emailed to the clients. Attached: all ${count} invoices in one PDF, and the list as a CSV (opens in Excel).\n\nMonthly billing:\n${appUrl()}/admin/billing?month=${month}\n`,
    attachments: [
      { filename: `faktury-${month}.pdf`, content: pdfBase64 },
      { filename: `faktury-${month}.csv`, content: csvBase64 },
    ],
  };
}

/** Asks the client to read and sign the informed consent form before their first session. */
export function consentRequestEmail(to: string, firstName: string, link: string): Mail {
  return {
    to,
    subject: "Please sign your consent form before your first session – Prague Integration",
    text: `Hi ${firstName},\n\nBefore your first session, please read and sign our informed consent form online. It takes about 5 minutes: you'll add your contact details and an emergency contact, and sign with your finger or mouse.\n\n${link}\n\n(Keep this link to yourself.) If the client is under 18, a parent or guardian signs on their behalf.\n\nThank you,\nPrague Integration\n+420 608 573 256\ncontact@pragueintegration.cz\n`,
  };
}

/** A copy of the signed consent form, for the client's records. */
export function consentSignedEmail(to: string, firstName: string, pdfBase64: string): Mail {
  return {
    to,
    subject: "Your signed consent form – Prague Integration",
    text: `Hi ${firstName},\n\nThank you for signing our informed consent form. A copy is attached for your records.\n\nPrague Integration\n`,
    attachments: [{ filename: "prague-integration-consent-form.pdf", content: pdfBase64 }],
  };
}

/** The intake & registration form, before the discovery session. */
export function intakeRequestEmail(to: string, firstName: string, link: string): Mail {
  return {
    to,
    subject: "Your intake & registration form – Prague Integration",
    text: `Hi ${firstName},\n\nBefore your discovery session, please fill in our intake & registration form. It takes about 10 minutes and helps your counsellor prepare:\n\n${link}\n\n(Keep this link to yourself.)\n\nPrague Integration\n+420 608 573 256\ncontact@pragueintegration.cz\n`,
  };
}

/** To the counsellor and coordinator: the client answered yes to thoughts of harm in the intake form. */
export function intakeHarmAlert(to: string, clientNickname: string, requestId: string): Mail {
  return {
    to,
    subject: `URGENT – ${clientNickname}: thoughts of harm in the intake form`,
    text: `${clientNickname} answered YES to "Have you had any thoughts of harming yourself or others?" in their intake form. The case is now marked as a crisis. Please contact them as soon as possible:\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

/** After the discovery session, the client chose counselling: consent form and how payment works. */
export function counsellingStartEmail(
  to: string,
  firstName: string,
  consentLink: string,
  p: { priceText: string; variableSymbol: string; account: string; iban: string; messageLink: string },
): Mail {
  return {
    to,
    subject: "Starting counselling: consent form and payment – Prague Integration",
    text: `Hi ${firstName},\n\nWe're glad you'd like to continue. Two things before your first full session:\n\n1. Please read and sign our informed consent form (about 5 minutes):\n${consentLink}\n\n2. Payment: ${p.priceText} per session. Please pay each session within 24 hours after it ends, by bank transfer to account ${p.account}${p.iban ? ` (IBAN ${p.iban})` : ""} with your variable symbol ${p.variableSymbol} – it identifies your payments. With each booked session you'll receive a QR code that fills this in for you, and you'll also find them on your private page:\n${p.messageLink}\n\nCancellations: please give at least 48 hours' notice; otherwise the full session fee is charged.\n\nPrague Integration\n+420 608 573 256\ncontact@pragueintegration.cz\n`,
  };
}

/** A private client hasn't been offered the discovery session within 24 hours: reassign them. */
export function lateDiscoveryOffer(to: string, clientNickname: string, requestId: string, counsellorName: string, crisis: boolean): Mail {
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}Back in the pool: ${clientNickname} – not contacted in 24 hours`,
    text: `${clientNickname}${crisis ? " (crisis)" : ""} was assigned to ${counsellorName} more than 24 hours ago and hasn't been offered the free discovery session or contacted. We promise clients another counsellor after 24 hours, so they're back in the pool.\n\nPlease assign another counsellor (Follow-up → Counsellor):\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

/** The second step of signing in. */
export function loginCodeEmail(to: string, name: string, code: string, minutes: number): Mail {
  return {
    to,
    subject: `Your sign-in code: ${code}`,
    text: `Hi ${name},\n\nYour Prague Integration sign-in code is:\n\n${code}\n\nIt works for ${minutes} minutes. If you didn't just try to sign in, someone may know your password: please change it (Forgot your password? on the sign-in page) and tell Amanda.\n`,
  };
}
