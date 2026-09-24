import { describe, expect, it } from "vitest";
import { validateRequest } from "./request-form";

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const item of [v].flat()) f.append(k, item);
  return f;
}

const valid = {
  firstName: "Jana",
  email: "Jana@Example.com",
  contactMethod: "Email",
  language: "Czech",
  format: "Online",
  topics: ["Anxiety", "Not a real topic"],
  crisis: "no",
  ageRange: "25–34",
  gender: "Woman",
  location: "Prague 3",
  consent: "yes",
};

describe("validateRequest", () => {
  it("accepts a complete request and cleans it", () => {
    const r = validateRequest(form(valid));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.email).toBe("jana@example.com");
      expect(r.data.topics).toEqual(["Anxiety"]);
    }
  });

  it("requires consent", () => {
    const r = validateRequest(form({ ...valid, consent: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.consent).toBeDefined();
  });

  it("requires a phone number when asked to be called", () => {
    const r = validateRequest(form({ ...valid, contactMethod: "Phone call" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toMatch(/call or text/);
    expect(validateRequest(form({ ...valid, contactMethod: "Phone call", phone: "+420 777 123 456" })).ok).toBe(true);
  });

  it("rejects values outside the offered options", () => {
    const r = validateRequest(form({ ...valid, language: "Klingon", format: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["format", "language"]);
  });

  it("records a crisis answer and requires one", () => {
    const r = validateRequest(form({ ...valid, crisis: "yes" }));
    expect(r.ok && r.data.crisis).toBe(true);
    const missing = validateRequest(form({ ...valid, crisis: "" }));
    expect(!missing.ok && missing.errors.crisis).toBeTruthy();
  });

  it("needs a topic or a message", () => {
    const none = validateRequest(form({ ...valid, topics: [] }));
    expect(!none.ok && none.errors.topics).toBeTruthy();
    expect(validateRequest(form({ ...valid, topics: [], message: "Trouble sleeping" })).ok).toBe(true);
  });

  it("requires age range, gender and location", () => {
    const r = validateRequest(form({ ...valid, ageRange: "", gender: "", location: " " }));
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["ageRange", "gender", "location"]);
  });
});
