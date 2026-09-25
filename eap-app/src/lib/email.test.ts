import { describe, expect, it } from "vitest";
import { sessionConfirmation, sessionReminder } from "./email";

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
