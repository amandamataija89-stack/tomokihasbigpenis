// The informed consent form: sending the link, checking and saving what the client signs, and the signed PDF.
import { createHash, randomBytes } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { appUrl } from "./app-url";
import { CONSENT_SECTIONS, CONSENT_TITLE, CONSENT_VERSION, consentPlainText } from "./consent-text";
import { pool } from "./db";
import { consentRequestEmail, consentSignedEmail, counsellingStartEmail, sendEmail } from "./email";
import { LIBERATION_SANS_BOLD, LIBERATION_SANS_REGULAR } from "./fonts/liberation-sans";

export type ConsentInput = {
  fullName: string;
  homeAddress: string;
  localAddress: string;
  phone: string;
  email: string;
  emergencyName: string;
  emergencyContact: string;
  otherInfo: string;
  forMinor: boolean;
  guardianName: string;
  signedName: string;
  signaturePng: string; // base64, without the data: prefix
};

export type ConsentErrors = Partial<Record<keyof ConsentInput | "agree", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateConsent(form: FormData): { ok: true; data: ConsentInput } | { ok: false; errors: ConsentErrors; values: Record<string, string> } {
  const t = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const values = {
    fullName: t("fullName", 160),
    homeAddress: t("homeAddress", 300),
    localAddress: t("localAddress", 300),
    phone: t("phone", 40),
    email: t("email", 200).toLowerCase(),
    emergencyName: t("emergencyName", 160),
    emergencyContact: t("emergencyContact", 300),
    otherInfo: t("otherInfo", 2000),
    forMinor: form.get("forMinor") === "yes" ? "yes" : "",
    guardianName: t("guardianName", 160),
    signedName: t("signedName", 160),
  };
  const sig = String(form.get("signature") ?? "");
  const errors: ConsentErrors = {};
  if (values.fullName.split(/\s+/).filter(Boolean).length < 2) errors.fullName = "Enter the client's first name and surname.";
  if (values.localAddress.length < 8) errors.localAddress = "Enter your residential address in Prague: street and number, postcode.";
  if (!/^\+?[\d\s()-]{6,}$/.test(values.phone)) errors.phone = "Enter a phone number, e.g. +420 777 123 456.";
  if (!EMAIL_RE.test(values.email)) errors.email = "Enter an email address like name@example.com.";
  if (!values.emergencyName) errors.emergencyName = "An emergency contact is required.";
  if (values.emergencyContact.length < 5) errors.emergencyContact = "Enter how they're related to you and their phone or email.";
  const forMinor = values.forMinor === "yes";
  if (forMinor && values.guardianName.split(/\s+/).filter(Boolean).length < 2)
    errors.guardianName = "Enter the full name of the parent or guardian signing.";
  const signer = forMinor ? values.guardianName : values.fullName;
  if (!values.signedName) errors.signedName = "Type your full name to sign.";
  else if (signer && values.signedName.toLowerCase().replace(/\s+/g, " ") !== signer.toLowerCase().replace(/\s+/g, " "))
    errors.signedName = forMinor ? "Type the parent's or guardian's full name, as above." : "Type the client's full name, as above.";
  const png = sig.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)?.[1] ?? "";
  // An empty canvas is a few hundred bytes; a real signature is more. Limit the size too.
  if (png.length < 1500) errors.signaturePng = "Please sign in the box with your finger or mouse.";
  else if (png.length > 400_000) errors.signaturePng = "The signature image is too large. Please clear it and sign again.";
  if (form.get("agree") !== "yes") errors.agree = "Please confirm you have read and agree to the form.";
  if (Object.keys(errors).length) return { ok: false, errors, values };
  return {
    ok: true,
    data: { ...values, forMinor, guardianName: forMinor ? values.guardianName : "", signaturePng: png },
  };
}

export const consentTextHash = () => createHash("sha256").update(consentPlainText()).digest("hex");

export async function saveConsent(requestId: string, c: ConsentInput, ip: string, userAgent: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO consent_forms (request_id, version, text_sha256, full_name, home_address, local_address, phone, email,
       emergency_name, emergency_contact, other_info, for_minor, guardian_name, signed_name, signature_png, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
    [
      requestId, CONSENT_VERSION, consentTextHash(), c.fullName, c.homeAddress, c.localAddress, c.phone, c.email,
      c.emergencyName, c.emergencyContact, c.otherInfo, c.forMinor, c.guardianName, c.signedName, c.signaturePng,
      ip.slice(0, 100), userAgent.slice(0, 300),
    ],
  );
  await pool.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
    requestId,
    `Informed consent form signed online by ${c.signedName}${c.forMinor ? " (parent/guardian of a minor)" : ""}.`,
  ]);
  return rows[0].id;
}

export type SignedConsent = ConsentInput & { id: string; version: string; signed_at: Date; ip: string };

export async function latestConsent(requestId: string): Promise<SignedConsent | null> {
  const { rows } = await pool.query(
    `SELECT id, version, signed_at, ip, full_name, home_address, local_address, phone, email, emergency_name,
       emergency_contact, other_info, for_minor, guardian_name, signed_name, signature_png
     FROM consent_forms WHERE request_id = $1 ORDER BY signed_at DESC LIMIT 1`,
    [requestId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, version: r.version, signed_at: r.signed_at, ip: r.ip, fullName: r.full_name, homeAddress: r.home_address,
    localAddress: r.local_address, phone: r.phone, email: r.email, emergencyName: r.emergency_name,
    emergencyContact: r.emergency_contact, otherInfo: r.other_info, forMinor: r.for_minor, guardianName: r.guardian_name,
    signedName: r.signed_name, signaturePng: r.signature_png,
  };
}

/** A private link to sign the form (same kind of link as the client's messages page). */
export async function consentLink(requestId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await pool.query("INSERT INTO message_links (token_hash, request_id) VALUES ($1, $2)", [
    createHash("sha256").update(token).digest("hex"),
    requestId,
  ]);
  return `${appUrl()}/consent/${token}`;
}

/** Emails the client the link to sign the consent form. */
export async function sendConsentRequest(requestId: string, staffId: string | null): Promise<void> {
  const { rows } = await pool.query<{ email: string; first_name: string }>(
    "SELECT email, first_name FROM support_requests WHERE id = $1",
    [requestId],
  );
  if (!rows[0]) return;
  await sendEmail(consentRequestEmail(rows[0].email, rows[0].first_name, await consentLink(requestId)));
  await pool.query("UPDATE support_requests SET consent_form_sent_at = now() WHERE id = $1", [requestId]);
  await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
    requestId,
    staffId,
    "Informed consent form emailed to the client to sign.",
  ]);
}

/** When the first session is booked: asks the client to sign, unless they already have or were asked. */
export async function requestConsentIfNeeded(requestId: string, staffId: string | null): Promise<boolean> {
  // Only Prague Integration's own (private) clients sign the form; EAP clients don't.
  const { rows } = await pool.query<{ asked: boolean; signed: boolean; kind: string }>(
    `SELECT consent_form_sent_at IS NOT NULL AS asked, kind,
       EXISTS (SELECT 1 FROM consent_forms WHERE request_id = $1) AS signed
     FROM support_requests WHERE id = $1`,
    [requestId],
  );
  if (!rows[0] || rows[0].kind !== "private" || rows[0].asked || rows[0].signed) return false;
  await sendConsentRequest(requestId, staffId);
  return true;
}

const dateTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Prague" }).format(d);

/** The signed form as a PDF: the full wording, what was filled in, and the signature. */
export async function renderConsentPdf(c: SignedConsent): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(Buffer.from(LIBERATION_SANS_REGULAR, "base64"), { subset: true });
  const bold = await doc.embedFont(Buffer.from(LIBERATION_SANS_BOLD, "base64"), { subset: true });
  doc.setTitle(`${CONSENT_TITLE} – ${c.fullName}`);
  const ink = rgb(0.13, 0.15, 0.2);
  const muted = rgb(0.42, 0.45, 0.5);
  const L = 50;
  const W = 495;
  let page = doc.addPage([595.28, 841.89]);
  let y = 790;
  const header = () =>
    page.drawText("Prague Integration s.r.o. · Olšanská 4E, 130 00 Praha 3 · IČO 21048428 · contact@pragueintegration.cz", {
      x: L, y: 815, size: 7.5, font: regular, color: muted,
    });
  header();
  const ensure = (h: number) => {
    if (y - h < 50) {
      page = doc.addPage([595.28, 841.89]);
      header();
      y = 790;
    }
  };
  const wrap = (s: string, width: number, font: PDFFont, size: number) => {
    const out: string[] = [];
    let line = "";
    for (const word of s.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
    return out;
  };
  const para = (s: string, o: { font?: PDFFont; size?: number; indent?: number; gap?: number } = {}) => {
    const size = o.size ?? 9.5;
    const font = o.font ?? regular;
    for (const w of wrap(s, W - (o.indent ?? 0), font, size)) {
      ensure(size + 3);
      page.drawText(w, { x: L + (o.indent ?? 0), y, size, font, color: ink });
      y -= size + 3.5;
    }
    y -= o.gap ?? 4;
  };

  para("PRAGUE INTEGRATION", { font: bold, size: 16, gap: 2 });
  para(CONSENT_TITLE.toUpperCase(), { font: bold, size: 12, gap: 10 });
  for (const s of CONSENT_SECTIONS) {
    if (s.heading) {
      y -= 4;
      para(s.heading, { font: bold, size: 11 });
    }
    for (const p of s.paragraphs ?? []) para(p);
    for (const b of s.bullets ?? []) {
      ensure(12);
      page.drawText("•", { x: L + 4, y, size: 9.5, font: regular, color: ink });
      para(b, { indent: 14, gap: 2 });
    }
  }

  y -= 8;
  para("Client Contact Information", { font: bold, size: 11 });
  const field = (label: string, value: string) => para(`${label}: ${value || "—"}`, { gap: 2 });
  field("Client's name and surname", c.fullName);
  field("Residential address in Prague", c.localAddress.replace(/\n/g, ", "));
  field("Permanent address (if different)", c.homeAddress.replace(/\n/g, ", "));
  field("Contact telephone number", c.phone);
  field("Email address", c.email);
  y -= 4;
  para("Emergency Contact", { font: bold, size: 11 });
  field("Name of contact", c.emergencyName);
  field("Relationship, email / telephone", c.emergencyContact);
  field("Any other relevant information", c.otherInfo);

  y -= 8;
  ensure(150);
  para("Signature", { font: bold, size: 11 });
  if (c.forMinor) field("Signed by parent/guardian for a minor under 18", c.guardianName);
  field("Name typed as signature", c.signedName);
  field("Date and time", `${dateTime(c.signed_at)} (Prague time)`);
  const img = await doc.embedPng(Buffer.from(c.signaturePng, "base64"));
  const scale = Math.min(220 / img.width, 80 / img.height);
  ensure(img.height * scale + 20);
  page.drawImage(img, { x: L, y: y - img.height * scale, width: img.width * scale, height: img.height * scale });
  y -= img.height * scale + 6;
  page.drawLine({ start: { x: L, y }, end: { x: L + 240, y }, thickness: 0.6, color: muted });
  y -= 14;
  para(
    `Signed electronically at ${appUrl().replace(/^https?:\/\//, "")} · form version ${c.version} · reference ${c.id}${c.ip ? ` · IP ${c.ip}` : ""}`,
    { size: 7.5 },
  );
  return doc.save();
}

/** Emails the client a copy of what they signed. */
export async function sendSignedCopy(c: SignedConsent, requestId: string): Promise<void> {
  const { rows } = await pool.query<{ first_name: string }>("SELECT first_name FROM support_requests WHERE id = $1", [requestId]);
  const pdf = Buffer.from(await renderConsentPdf(c)).toString("base64");
  await sendEmail(consentSignedEmail(c.email, rows[0]?.first_name ?? c.fullName, pdf));
}

/**
 * The first full (paid) session of a private client is booked: they're sent the consent form and how
 * payment works (price, variable symbol, pay within 24 hours after each session). Once only.
 */
export async function startCounselling(requestId: string, staffId: string | null): Promise<boolean> {
  const { rows } = await pool.query<{ kind: string; agreed: boolean; email: string; first_name: string; price: number | null; net: number | null; student: boolean }>(
    `SELECT kind, counselling_agreed_at IS NOT NULL AS agreed, email, first_name, session_price_czk AS price, session_price_net_czk AS net, student_discount AS student
     FROM support_requests WHERE id = $1`,
    [requestId],
  );
  const r = rows[0];
  if (!r || r.kind !== "private" || r.agreed) return false;
  const { discounted, ensureVariableSymbol, invoiceSettings, STUDENT_DISCOUNT_PERCENT } = await import("./billing");
  const { clientMessageLink } = await import("./messages");
  const settings = await invoiceSettings();
  const vs = await ensureVariableSymbol(requestId);
  const priceText =
    r.price !== null
      ? `${r.price.toLocaleString("cs-CZ")} CZK${
          settings.vatPayer && r.net !== null
            ? ` (${discounted(r.net, r.student).toLocaleString("cs-CZ")} CZK + ${settings.vatRate} % VAT${r.student ? `, with your ${STUDENT_DISCOUNT_PERCENT} % student discount` : ""})`
            : ""
        }`
      : "the price agreed with your counsellor";
  await sendEmail(
    counsellingStartEmail(r.email, r.first_name, await consentLink(requestId), {
      priceText,
      variableSymbol: vs,
      account: settings.bankAccount,
      iban: settings.iban,
      messageLink: await clientMessageLink(requestId),
    }),
  );
  await pool.query(
    "UPDATE support_requests SET counselling_agreed_at = now(), consent_form_sent_at = now(), updated_at = now() WHERE id = $1",
    [requestId],
  );
  await pool.query("INSERT INTO request_notes (request_id, staff_id, body) VALUES ($1, $2, $3)", [
    requestId,
    staffId,
    "First full session booked: consent form and payment information emailed to the client.",
  ]);
  return true;
}
