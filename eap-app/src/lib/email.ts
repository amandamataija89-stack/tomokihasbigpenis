// Sends mail through Resend (the same provider the outreach scripts use).
// Without RESEND_API_KEY the message is logged instead, for local development.

type Mail = { to: string; subject: string; text: string };

export async function sendEmail({ to, subject, text }: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Prague Integration <contact@pragueintegration.cz>";
  if (!key) {
    console.info(`[email not sent: RESEND_API_KEY unset] to=${to} subject=${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
}

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

// Deliberately contains nothing the person wrote: email is not where health information should travel.
export function teamAlert(companyName: string, requestId: string, assignedName: string | null, crisis: boolean): Mail {
  const who = assignedName ? `Assigned automatically to: ${assignedName}` : "Not assigned: someone needs to pick this up.";
  const urgent = crisis ? "URGENT: the person says they need help urgently. Contact them as soon as possible.\n\n" : "";
  return {
    to: process.env.TEAM_NOTIFY_EMAIL ?? "contact@pragueintegration.cz",
    subject: `${crisis ? "URGENT – " : ""}New EAP request (${companyName})${assignedName ? "" : " – needs assigning"}`,
    text: `${urgent}A new support request has come in.\n\nCompany: ${companyName}\n${who}\n\nOpen it here to see the details and make contact within 24 working hours:\n${appUrl()}/admin/requests/${requestId}\n`,
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
    subject: `${crisis ? "URGENT – " : ""}New EAP client offered to you: please accept or decline`,
    text: `Hi ${therapistName},\n\nA new EAP client has been offered to you.${
      crisis ? " They say they need help urgently." : ""
    }\n\nPlease open it and press Accept or Decline${by ? ` by ${by} (Prague time)` : ""}. If you don't answer by then, the client is passed to the next available counsellor.${
      crisis ? " Once you accept, contact them as soon as possible today." : " Once you accept, please contact them as soon as you can: they were promised contact within 24 working hours of asking."
    }\n\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

export function offerReminder(to: string, therapistName: string, requestId: string, crisis: boolean, respondBy: Date): Mail {
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}Reminder: please accept or decline your new EAP client`,
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

export function nobodyAvailable(to: string, clientNickname: string, requestId: string, crisis: boolean): Mail {
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}No counsellor available for ${clientNickname}`,
    text: `${clientNickname}${crisis ? ", who said they need help urgently," : ""} was declined or not accepted in time, and no other counsellor is available right now (everyone is full, away, or has already passed on them).\n\nThe app will offer them automatically as soon as someone becomes available, but please assign them now if you can:\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

export type Digest = { pool: number; crisisInPool: number; awaiting: number; overdue: number };

export function dailyDigest(to: string, d: Digest): Mail {
  const lines = [
    `Clients in the pool (nobody available): ${d.pool}${d.crisisInPool ? ` (${d.crisisInPool} crisis)` : ""}`,
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

export function employeeConfirmation(to: string, firstName: string, crisis = false, messageLink?: string): Mail {
  return {
    to,
    subject: "We've received your request – Prague Integration",
    text: `Hi ${firstName},\n\nThank you for reaching out. We've received your request and someone from our team will contact you ${crisis ? "as soon as possible" : "within 24 working hours (Monday to Friday)"}, in the way you asked.${messageLine(messageLink)}\n\nEverything you share with us is confidential. Your employer is not told who uses the programme.\n\nIf you need urgent help before we reach you, call 112 (emergency) or the Linka první psychické pomoci on 116 123 (free, 24/7).\n\nPrague Integration\n+420 608 573 256\ncontact@pragueintegration.cz\n`,
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
  total: number;
  format: string;
  therapistName: string | null;
};

export const lateCancellationPolicy = (hours: number, total: number) =>
  `Cancellation policy: if you need to cancel or move a session, please tell us at least ${hours} hours before it starts. A session cancelled with less notice counts as one of your ${total} sessions.`;

// Contains only practical details, nothing about why the person is coming.
export function sessionConfirmation(s: SessionEmail): Mail {
  const where =
    s.format === "In person in Prague"
      ? "Where: Prague Integration, Mezibranská 4, 110 00 Prague 1"
      : s.format === "Online"
        ? "Where: online. Your therapist will send you the details for joining."
        : "Your therapist will let you know whether you'll meet online or in person.";
  const withWhom = s.therapistName ? ` with ${s.therapistName}` : "";
  const subject = {
    booked: `Your session is booked: ${s.when}`,
    moved: `Your session has moved: ${s.when}`,
    cancelled: `Your session on ${s.when} is cancelled`,
  }[s.kind];
  const lead = {
    booked: `your session${withWhom} is booked for:`,
    moved: `your session${withWhom} has moved to:`,
    cancelled: `your session${withWhom} on the date below has been cancelled:`,
  }[s.kind];
  const policy = s.lateCancelHours ? `\n\n${lateCancellationPolicy(s.lateCancelHours, s.total)}` : "";
  const body =
    s.kind === "cancelled"
      ? `\n\nWe'll be in touch to find a new time.`
      : `\nSession ${s.number} of ${s.total}\n${where}${policy}`;
  return {
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

export function sessionReminder(s: Omit<SessionEmail, "kind"> & { cancelBy: string; lateCancelHours: number }): Mail {
  const where =
    s.format === "In person in Prague"
      ? "Where: Prague Integration, Mezibranská 4, 110 00 Prague 1"
      : s.format === "Online"
        ? "Where: online. Your therapist will send you the details for joining."
        : "";
  return {
    to: s.to,
    subject: `Reminder: your session on ${s.when} – Prague Integration`,
    text: `Hi ${s.firstName},\n\nA reminder of your upcoming session${s.therapistName ? ` with ${s.therapistName}` : ""}:\n\n${s.when} (Prague time)\nSession ${s.number} of ${s.total}${where ? `\n${where}` : ""}\n\nIf you need to cancel or move it, please tell us by ${s.cancelBy}: ${s.messageLink ? `message us on your private page (${s.messageLink})` : "reply to this email"} or call +420 608 573 256. After that, a cancellation counts as one of your ${s.total} sessions.\n\nSee you soon,\nPrague Integration\n`,
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
