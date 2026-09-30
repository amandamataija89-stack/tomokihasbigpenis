import { describe, expect, it } from "vitest";
import { sessionIcs } from "./ics";

describe("calendar invitation", () => {
  it("is a valid event with the session's time, place and a stable id", () => {
    const ics = sessionIcs({
      id: "abc",
      start: new Date("2026-10-08T08:00:00Z"),
      minutes: 50,
      summary: "Counselling session with Eva Novak – Prague Integration",
      location: "Prague Integration, Mezibranská 4, 110 00 Prague 1",
      description: "To change the time, call +420 608 573 256.",
      now: new Date("2026-10-01T10:00:00Z"),
    });
    expect(ics).toContain("UID:abc@pragueintegration.cz");
    expect(ics).toContain("DTSTART:20261008T080000Z");
    expect(ics).toContain("DTEND:20261008T085000Z");
    expect(ics).toContain("LOCATION:Prague Integration\\, Mezibranská 4\\, 110 00 Prague 1");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
  it("cancels the same event", () => {
    const ics = sessionIcs({ id: "abc", start: new Date(), minutes: 50, summary: "x", location: "", description: "", cancelled: true });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
  });
});
