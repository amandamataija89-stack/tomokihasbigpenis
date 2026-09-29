// Prague Integration's intake & registration form, filled in online by the client before their discovery
// session. Answering "yes" to thoughts of harming themselves or others marks the case as a crisis at once.
import { createHash, randomBytes } from "node:crypto";
import { appUrl } from "./app-url";
import { pool } from "./db";
import { intakeHarmAlert, intakeRequestEmail, sendEmail } from "./email";

export { DECLARATION, FREQUENCY, RELATIONSHIP, SYMPTOMS } from "./intake-options";
import { FREQUENCY, RELATIONSHIP, SYMPTOMS } from "./intake-options";

export type IntakeAnswers = {
  lastName: string;
  firstName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  countryOfOrigin: string;
  relationship: string;
  livesInCz: "yes" | "no" | "";
  illnesses: string;
  medications: string;
  symptoms: string[];
  frequency: string;
  familyHistory: "yes" | "no" | "";
  familyHistoryDetails: string;
  harmThoughts: "yes" | "no" | "";
  harmDetails: string;
  previousHelp: "yes" | "no" | "";
  previousHelpDetails: string;
  addiction: "yes" | "no" | "";
  addictionDetails: string;
  motivation: string;
  questions: string;
};

export type IntakeErrors = Partial<Record<keyof IntakeAnswers | "declaration" | "signedName" | "signaturePng", string>>;

const yesNo = (v: unknown) => (v === "yes" || v === "no" ? v : "") as "yes" | "no" | "";

export function validateIntake(form: FormData):
  | { ok: true; answers: IntakeAnswers; signedName: string; signaturePng: string }
  | { ok: false; errors: IntakeErrors; values: Record<string, string | string[]> } {
  const t = (k: string, max = 2000) => String(form.get(k) ?? "").trim().slice(0, max);
  const a: IntakeAnswers = {
    lastName: t("lastName", 120),
    firstName: t("firstName", 120),
    dateOfBirth: t("dateOfBirth", 20),
    gender: t("gender", 60),
    phone: t("phone", 40),
    email: t("email", 200).toLowerCase(),
    countryOfOrigin: t("countryOfOrigin", 120),
    relationship: t("relationship", 40),
    livesInCz: yesNo(form.get("livesInCz")),
    illnesses: t("illnesses"),
    medications: t("medications"),
    symptoms: form.getAll("symptoms").map(String).filter((s) => (SYMPTOMS as readonly string[]).includes(s)),
    frequency: t("frequency", 20),
    familyHistory: yesNo(form.get("familyHistory")),
    familyHistoryDetails: t("familyHistoryDetails"),
    harmThoughts: yesNo(form.get("harmThoughts")),
    harmDetails: t("harmDetails"),
    previousHelp: yesNo(form.get("previousHelp")),
    previousHelpDetails: t("previousHelpDetails"),
    addiction: yesNo(form.get("addiction")),
    addictionDetails: t("addictionDetails"),
    motivation: t("motivation"),
    questions: t("questions"),
  };
  const signedName = t("signedName", 160);
  const sig = String(form.get("signature") ?? "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)?.[1] ?? "";
  const e: IntakeErrors = {};
  if (!a.lastName) e.lastName = "Enter your last name.";
  if (!a.firstName) e.firstName = "Enter your first name.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dateOfBirth)) e.dateOfBirth = "Enter your date of birth.";
  if (!/^\+?[\d\s()-]{6,}$/.test(a.phone)) e.phone = "Enter a phone number, e.g. +420 777 123 456.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) e.email = "Enter an email address like name@example.com.";
  if (!(RELATIONSHIP as readonly string[]).includes(a.relationship)) e.relationship = "Choose one.";
  if (!a.livesInCz) e.livesInCz = "Choose yes or no.";
  if (a.symptoms.length && !(FREQUENCY as readonly string[]).includes(a.frequency)) e.frequency = "Choose how often.";
  for (const k of ["familyHistory", "harmThoughts", "previousHelp", "addiction"] as const) if (!a[k]) e[k] = "Choose yes or no.";
  if (a.harmThoughts === "yes" && !a.harmDetails) e.harmDetails = "Please describe briefly, so we can support you safely.";
  if (!a.motivation) e.motivation = "Please write a few words.";
  if (form.get("declaration") !== "yes") e.declaration = "Please confirm the declaration.";
  if (!signedName) e.signedName = "Type your full name to sign.";
  if (sig.length < 1500) e.signaturePng = "Please sign in the box with your finger or mouse.";
  else if (sig.length > 400_000) e.signaturePng = "The signature image is too large. Please clear it and sign again.";
  if (Object.keys(e).length) {
    const values: Record<string, string | string[]> = { ...a, signedName };
    return { ok: false, errors: e, values };
  }
  return { ok: true, answers: a, signedName, signaturePng: sig };
}

/** Saves the form. Thoughts of harm mark the case as a crisis and alert the counsellor straight away. */
export async function saveIntake(requestId: string, answers: IntakeAnswers, signedName: string, signaturePng: string, ip: string, ua: string) {
  await pool.query(
    `INSERT INTO intake_forms (request_id, answers, signed_name, signature_png, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6)`,
    [requestId, JSON.stringify(answers), signedName, signaturePng, ip.slice(0, 100), ua.slice(0, 300)],
  );
  await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [requestId, "Intake & registration form filled in by the client."]);
  if (answers.harmThoughts === "yes") {
    await pool.query("UPDATE support_requests SET crisis = true, updated_at = now() WHERE id = $1", [requestId]);
    await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
      requestId,
      "URGENT: in the intake form the client answered YES to thoughts of harming themselves or others. Marked as a crisis case.",
    ]);
    const { rows } = await pool.query<{ email: string; name: string; first_name: string }>(
      `SELECT s.email, s.name, r.first_name FROM support_requests r JOIN staff s ON s.id = r.assigned_to WHERE r.id = $1`,
      [requestId],
    );
    const { coordinatorEmails } = await import("./offers");
    const to = new Set([...(rows[0] ? [rows[0].email] : []), ...(await coordinatorEmails())]);
    for (const email of to)
      await sendEmail(intakeHarmAlert(email, rows[0]?.first_name ?? "A client", requestId)).catch((err) =>
        console.error("EAP intake alert failed:", err),
      );
  }
}

export type SignedIntake = { answers: IntakeAnswers; signed_name: string; signed_at: Date };

export async function latestIntake(requestId: string): Promise<SignedIntake | null> {
  const { rows } = await pool.query<SignedIntake>(
    "SELECT answers, signed_name, signed_at FROM intake_forms WHERE request_id = $1 ORDER BY signed_at DESC LIMIT 1",
    [requestId],
  );
  return rows[0] ?? null;
}

/** A private link to fill in the intake form (same kind of link as the client's messages page). */
export async function intakeLink(requestId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await pool.query("INSERT INTO message_links (token_hash, request_id) VALUES ($1, $2)", [
    createHash("sha256").update(token).digest("hex"),
    requestId,
  ]);
  return `${appUrl()}/intake/${token}`;
}

/** Emails the client the intake form on its own (it also goes with the discovery session invitation). */
export async function sendIntakeRequest(requestId: string, staffId: string | null): Promise<void> {
  const { rows } = await pool.query<{ email: string; first_name: string }>("SELECT email, first_name FROM support_requests WHERE id = $1", [requestId]);
  if (!rows[0]) return;
  await sendEmail(intakeRequestEmail(rows[0].email, rows[0].first_name, await intakeLink(requestId)));
  await pool.query("UPDATE support_requests SET intake_sent_at = now() WHERE id = $1", [requestId]);
  await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
    requestId,
    staffId,
    "Intake & registration form emailed to the client.",
  ]);
}
