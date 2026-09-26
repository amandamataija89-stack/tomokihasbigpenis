import { describe, expect, it } from "vitest";
import { addOfficeHours, addWorkingHours, contactDue, contactReminderAt, offerReminderAt, respondBy } from "./deadlines";

// Prague is UTC+2 in summer: 13:00Z = 15:00 Prague. 25 Sept 2026 is a Friday.
const iso = (d: Date) => d.toISOString();

describe("addWorkingHours", () => {
  it("adds straight through on weekdays", () => {
    expect(iso(addWorkingHours(new Date("2026-09-23T08:00:00Z"), 24))).toBe("2026-09-24T08:00:00.000Z");
  });
  it("skips the weekend: Friday 15:00 + 24 working hours is Monday 15:00", () => {
    expect(iso(addWorkingHours(new Date("2026-09-25T13:00:00Z"), 24))).toBe("2026-09-28T13:00:00.000Z");
  });
  it("starts counting on Monday when submitted at the weekend", () => {
    expect(iso(addWorkingHours(new Date("2026-09-26T10:00:00Z"), 24))).toBe("2026-09-28T22:00:00.000Z");
  });
});

describe("addOfficeHours (Mon–Fri 08:00–18:00)", () => {
  it("Monday 10:00 + 4 is Monday 14:00", () => {
    expect(iso(addOfficeHours(new Date("2026-09-28T08:00:00Z"), 4))).toBe("2026-09-28T12:00:00.000Z");
  });
  it("Monday 20:00 + 4 is Tuesday 12:00: nobody is chased overnight", () => {
    expect(iso(addOfficeHours(new Date("2026-09-28T18:00:00Z"), 4))).toBe("2026-09-29T10:00:00.000Z");
  });
  it("Friday 16:00 + 4 is Monday 10:00", () => {
    expect(iso(addOfficeHours(new Date("2026-09-25T14:00:00Z"), 4))).toBe("2026-09-28T08:00:00.000Z");
  });
});

describe("offers and contact, counted from when the client submits", () => {
  const monday10 = new Date("2026-09-28T08:00:00Z");
  it("normal: accept by Tue 10:00 (reminder Mon 22:00), contact reminder Tue 04:00, due Tue 10:00", () => {
    expect(iso(respondBy(monday10, false))).toBe("2026-09-29T08:00:00.000Z");
    expect(iso(offerReminderAt(monday10, false))).toBe("2026-09-28T20:00:00.000Z");
    expect(iso(contactReminderAt(monday10, false))).toBe("2026-09-29T02:00:00.000Z");
    expect(iso(contactDue(monday10, false))).toBe("2026-09-29T08:00:00.000Z");
  });
  it("offered Friday 16:00: accept by Monday 16:00 (weekend skipped)", () => {
    expect(iso(respondBy(new Date("2026-09-25T14:00:00Z"), false))).toBe("2026-09-28T14:00:00.000Z");
  });
  it("crisis: 30 minutes to accept, contact reminder after 1 hour, due after 2, even at the weekend", () => {
    const saturday = new Date("2026-09-26T10:00:00Z");
    expect(iso(respondBy(saturday, true))).toBe("2026-09-26T10:30:00.000Z");
    expect(iso(contactReminderAt(saturday, true))).toBe("2026-09-26T11:00:00.000Z");
    expect(iso(contactDue(saturday, true))).toBe("2026-09-26T12:00:00.000Z");
  });
});
