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
    text: `${urgent}A new support request has come in.\n\nCompany: ${companyName}\n${who}\n\nOpen it here to see the details and make contact within 24 hours:\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

export function therapistAlert(to: string, therapistName: string, requestId: string, crisis = false): Mail {
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}New EAP client assigned to you`,
    text: `Hi ${therapistName},\n\nA new EAP client has been assigned to you. ${
      crisis
        ? "They say they need help urgently: please contact them as soon as possible today."
        : "Please make first contact within 24 hours."
    }\n\nThe details are here (staff sign-in needed):\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

export function employeeConfirmation(to: string, firstName: string): Mail {
  return {
    to,
    subject: "We've received your request – Prague Integration",
    text: `Hi ${firstName},\n\nThank you for reaching out. We've received your request and someone from our team will contact you within 24 hours, in the way you asked.\n\nEverything you share with us is confidential. Your employer is not told who uses the programme.\n\nIf you need urgent help before we reach you, call 112 (emergency) or the Linka první psychické pomoci on 116 123 (free, 24/7).\n\nPrague Integration\n+420 608 573 256\ncontact@pragueintegration.cz\n`,
  };
}

export type SessionEmail = {
  to: string;
  firstName: string;
  kind: "booked" | "moved" | "cancelled";
  when: string; // e.g. "Tuesday 30 September 2026 at 14:00"
  number: number;
  total: number;
  format: string;
  therapistName: string | null;
};

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
  const body =
    s.kind === "cancelled"
      ? `\n\nWe'll be in touch to find a new time.`
      : `\nSession ${s.number} of ${s.total}\n${where}`;
  return {
    to: s.to,
    subject: `${subject} – Prague Integration`,
    text: `Hi ${s.firstName},\n\n${lead[0].toUpperCase()}${lead.slice(1)}\n\n${s.when} (Prague time)${body}\n\nIf you need to change the time, reply to this email or call +420 608 573 256.\n\nPrague Integration\ncontact@pragueintegration.cz\n`,
  };
}

export function overdueWarning(
  to: string,
  counsellorName: string,
  clientFirstName: string,
  requestId: string,
  hours: number,
  crisis: boolean,
): Mail {
  return {
    to,
    subject: `${crisis ? "URGENT – " : ""}Reminder: ${clientFirstName} hasn't been contacted yet`,
    text: `Hi ${counsellorName},\n\n${clientFirstName}${crisis ? ", who said they need help urgently," : ""} asked for support more than ${hours} hours ago and is still marked New.\n\nPlease contact them ${crisis ? "right away" : "today"}, then book their first session or set the case to Contacted:\n${appUrl()}/admin/requests/${requestId}\n\nIf you can't take this client, tell the team so it can be reassigned.\n`,
  };
}

export function teamOverdueWarning(clientFirstName: string, requestId: string, hours: number, crisis: boolean): Mail {
  return {
    to: process.env.TEAM_NOTIFY_EMAIL ?? "contact@pragueintegration.cz",
    subject: `${crisis ? "URGENT – " : ""}Unassigned request not contacted in ${hours} hours`,
    text: `${clientFirstName} asked for support more than ${hours} hours ago, nobody is assigned, and the case is still New.\n\nPlease assign it now:\n${appUrl()}/admin/requests/${requestId}\n`,
  };
}

export function feedbackInvitation(to: string, firstName: string, token: string): Mail {
  return {
    to,
    subject: "How did it go? Anonymous feedback – Prague Integration",
    text: `Hi ${firstName},\n\nThank you for working with us. We'd be grateful for your feedback: it takes about two minutes and helps us improve.\n\n${appUrl()}/feedback/${token}\n\nYour answers are anonymous: we don't store your name or email with them, and your counsellor doesn't see them. The link works once and expires in 60 days.\n\nPrague Integration\n`,
  };
}
