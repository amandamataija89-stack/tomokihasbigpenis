import { describe, expect, it } from "vitest";
import { addWorkingHours, respondBy } from "./deadlines";

// Prague is UTC+2 in summer: 13:00Z = 15:00 Prague.
describe("addWorkingHours", () => {
  it("adds straight through on weekdays", () => {
    expect(addWorkingHours(new Date("2026-09-23T08:00:00Z"), 24).toISOString()).toBe("2026-09-24T08:00:00.000Z");
  });

  it("skips the weekend: Friday 15:00 + 24 working hours is Monday 15:00", () => {
    expect(addWorkingHours(new Date("2026-09-25T13:00:00Z"), 24).toISOString()).toBe("2026-09-28T13:00:00.000Z");
  });

  it("starts counting on Monday when assigned at the weekend", () => {
    // Saturday 12:00 Prague -> counting starts Monday 00:00 Prague (Sunday 22:00Z) -> Tuesday 00:00 Prague.
    expect(addWorkingHours(new Date("2026-09-26T10:00:00Z"), 24).toISOString()).toBe("2026-09-28T22:00:00.000Z");
  });
});

describe("respondBy", () => {
  it("gives crisis cases 2 clock hours, even at the weekend", () => {
    expect(respondBy(new Date("2026-09-26T10:00:00Z"), true).toISOString()).toBe("2026-09-26T12:00:00.000Z");
  });
});
