// The employee request form: its options and validation. Shared by the page and the server action.

export const CONTACT_METHODS = ["Email", "Phone call", "Text message"] as const;
export const LANGUAGES = ["English", "Czech", "Russian", "Spanish", "Other"] as const;
export const FORMATS = ["Online", "In person in Prague", "No preference"] as const;
export const TOPICS = [
  "Stress or burnout",
  "Anxiety",
  "Low mood",
  "Relationships or family",
  "Work situation",
  "Settling in to life in Prague",
  "ADHD or neurodiversity",
  "Grief or loss",
  "Something else",
] as const;

export type RequestInput = {
  firstName: string;
  email: string;
  phone: string;
  contactMethod: string;
  language: string;
  format: string;
  topics: string[];
  message: string;
};

export type FieldErrors = Partial<Record<keyof RequestInput | "consent", string>>;

export type ValidationResult =
  | { ok: true; data: RequestInput }
  | { ok: false; errors: FieldErrors; values: Partial<RequestInput> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(form: FormData, key: string, max: number): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function validateRequest(form: FormData): ValidationResult {
  const values: RequestInput = {
    firstName: text(form, "firstName", 80),
    email: text(form, "email", 200).toLowerCase(),
    phone: text(form, "phone", 40),
    contactMethod: text(form, "contactMethod", 40),
    language: text(form, "language", 40),
    format: text(form, "format", 40),
    topics: form
      .getAll("topics")
      .filter((t): t is string => typeof t === "string" && (TOPICS as readonly string[]).includes(t)),
    message: text(form, "message", 2000),
  };
  const errors: FieldErrors = {};

  if (!values.firstName) errors.firstName = "Enter the name you'd like us to use.";
  if (!EMAIL_RE.test(values.email)) errors.email = "Enter an email address like name@example.com.";
  if (!(CONTACT_METHODS as readonly string[]).includes(values.contactMethod))
    errors.contactMethod = "Choose how we should contact you.";
  if (values.phone && !/^\+?[\d\s()-]{6,}$/.test(values.phone))
    errors.phone = "Enter a phone number using digits, e.g. +420 777 123 456.";
  else if (!values.phone && (values.contactMethod === "Phone call" || values.contactMethod === "Text message"))
    errors.phone = "Enter a phone number so we can call or text you.";
  if (!(LANGUAGES as readonly string[]).includes(values.language)) errors.language = "Choose a language.";
  if (!(FORMATS as readonly string[]).includes(values.format)) errors.format = "Choose how you'd like to meet.";
  if (form.get("consent") !== "yes")
    errors.consent = "We need your agreement to store your request before we can help.";

  return Object.keys(errors).length ? { ok: false, errors, values } : { ok: true, data: values };
}
