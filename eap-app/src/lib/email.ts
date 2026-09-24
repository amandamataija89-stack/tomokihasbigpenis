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
