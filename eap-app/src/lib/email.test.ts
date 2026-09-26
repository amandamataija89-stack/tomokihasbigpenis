import { describe, expect, it } from "vitest";
import {
  emailProblem,
  employeeConfirmation,
  keyHint,
  newMessageForClient,
  newReplyForStaff,
  resendKey,
  sessionConfirmation,
  sessionReminder,
  teamAlert,
} from "./email";
import { sessionLimit } from "./data";

const base = {
  to: "jana@example.com",
  firstName: "Jana",
  when: "Wednesday 30 September 2026 at 14:00",
  number: 2,
  total: 5,
  therapistName: "Eva Nováková",
};

describe("sessionConfirmation", () => {
  it("gives the time, session number, therapist and address for in-person sessions", () => {
    const m = sessionConfirmation({ ...base, kind: "booked", format: "In person in Prague" });
    expect(m.to).toBe("jana@example.com");
    expect(m.subject).toContain("booked");
    expect(m.text).toContain("with Eva Nováková");
    expect(m.text).toContain("Session 2 of 5");
    expect(m.text).toContain("Mezibranská 4");
  });

  it("explains online joining and handles moves and cancellations", () => {
    expect(sessionConfirmation({ ...base, kind: "moved", format: "Online" }).text).toContain("online");
    const c = sessionConfirmation({ ...base, kind: "cancelled", format: "Online" });
    expect(c.subject).toContain("cancelled");
    expect(c.text).not.toContain("Session 2 of 5");
  });
});

describe("cancellation policy", () => {
  it("is in the first booking email only when asked for", () => {
    const first = sessionConfirmation({ ...base, number: 1, kind: "booked", format: "Online", lateCancelHours: 48 });
    expect(first.text).toContain("at least 48 hours before");
    expect(first.text).toContain("counts as one of your 5 sessions");
    expect(sessionConfirmation({ ...base, kind: "booked", format: "Online" }).text).not.toContain("Cancellation policy");
  });

  it("is repeated in the 48-hour reminder with the cancel-by time", () => {
    const m = sessionReminder({ ...base, format: "Online", lateCancelHours: 48, cancelBy: "Sunday 27 September, 17:00" });
    expect(m.subject).toContain("Reminder");
    expect(m.text).toContain("please tell us by Sunday 27 September, 17:00");
  });
});

describe("employeeConfirmation", () => {
  it("promises 24 working hours, or as soon as possible for urgent requests", () => {
    expect(employeeConfirmation("a@example.com", "Míša").text).toContain("within 24 working hours (Monday to Friday)");
    expect(employeeConfirmation("a@example.com", "Míša", true).text).toContain("as soon as possible");
  });
});

describe("message notifications", () => {
  it("link to the conversation but never include the message", () => {
    const m = newMessageForClient("a@example.com", "Nela", "Eva Nováková", "https://eap.example/messages/abc");
    expect(m.text).toContain("https://eap.example/messages/abc");
    expect(m.subject).toBe("New message from Eva Nováková");
    const s = newReplyForStaff("eva@example.com", "Eva", "Nela", "123");
    expect(s.text).toContain("/admin/requests/123#messages");
  });

  it("put the private link in the confirmation and session emails", () => {
    expect(employeeConfirmation("a@example.com", "Nela", false, "https://x/messages/t").text).toContain("https://x/messages/t");
    const booked = sessionConfirmation({ ...base, kind: "booked", format: "Online", messageLink: "https://x/messages/t" });
    expect(booked.text).toContain("message us on your private page (https://x/messages/t)");
  });
});

describe("emailProblem", () => {
  it("explains a rejected API key", () => {
    expect(emailProblem(new Error('Resend returned 401: {"message":"API key is invalid"}'))).toMatch(/RESEND_API_KEY/);
  });
  it("explains an unverified domain", () => {
    expect(emailProblem(new Error('Resend returned 403: {"message":"The pragueintegration.cz domain is not verified"}'))).toMatch(
      /isn't verified/,
    );
  });
  it("never shows a key", () => {
    expect(emailProblem(new Error("Resend returned 500: bad re_abc123XYZ"))).not.toContain("re_abc123XYZ");
  });
});

describe("resendKey", () => {
  it("picks the key out of a messy paste", () => {
    expect(resendKey(' "RESEND_API_KEY=re_Ab12_cd34"\n')).toBe("re_Ab12_cd34");
    expect(resendKey(" re_Ab12_cd34 ")).toBe("re_Ab12_cd34");
  });
  it("describes a key without revealing it", () => {
    expect(keyHint("re_Ab12_cd34XYZ")).toContain('"re_Ab1"');
    expect(keyHint("re_Ab12_cd34XYZ")).not.toContain("cd34");
    expect(keyHint("prague-eap")).toMatch(/doesn't start with "re_"/);
  });
});

describe("private clients", () => {
  it("have no session limit", () => {
    expect(sessionLimit("eap")).toBe(5);
    expect(sessionLimit("private")).toBeNull();
  });
  it("get session emails without a total, and late cancellations are charged", () => {
    const m = sessionConfirmation({ ...base, total: null, kind: "booked", format: "Online", number: 1, lateCancelHours: 48 });
    expect(m.text).toContain("Session 1\n");
    expect(m.text).not.toContain(" of ");
    expect(m.text).toContain("is charged as a session");
    const r = sessionReminder({ ...base, total: null, format: "Online", lateCancelHours: 48, cancelBy: "Monday 28 September at 14:00" });
    expect(r.text).toContain("Session 2\n");
    expect(r.text).toContain("a cancellation is charged as a session");
  });
  it("aren't told about an employer", () => {
    expect(employeeConfirmation("a@b.cz", "Jana", false, undefined, true).text).not.toContain("employer");
    expect(employeeConfirmation("a@b.cz", "Jana").text).toContain("employer");
  });
  it("are flagged to the team as needing a counsellor", () => {
    const m = teamAlert(null, "id", null, false);
    expect(m.subject).toBe("New private client – needs assigning");
    expect(m.text).toContain("Private client");
  });
});
