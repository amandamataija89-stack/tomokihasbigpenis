import { describe, expect, it } from "vitest";
import { isOverdue, toPragueInput } from "./format";

describe("toPragueInput", () => {
  it("shows times in Prague, summer and winter", () => {
    expect(toPragueInput(new Date("2026-09-30T12:00:00Z"))).toBe("2026-09-30T14:00");
    expect(toPragueInput(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-02T00:30");
  });
});

describe("isOverdue", () => {
  it("doesn't count the weekend towards the 24 working hours", () => {
    const friday3pm = new Date("2026-09-25T13:00:00Z");
    expect(isOverdue(friday3pm, new Date("2026-09-27T13:00:00Z").getTime())).toBe(false); // Sunday
    expect(isOverdue(friday3pm, new Date("2026-09-28T13:30:00Z").getTime())).toBe(true); // Monday 15:30
  });
});
