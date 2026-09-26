import { describe, expect, it } from "vitest";
import { previousMonth } from "./invoice-mail";
import { adminDeadline, currentMonth } from "./month-end";

describe("months", () => {
  it("knows last month and this month's deadline in Prague time", () => {
    expect(previousMonth(new Date("2026-10-01T06:00:00Z"))).toBe("2026-09");
    expect(previousMonth(new Date("2027-01-15T12:00:00Z"))).toBe("2026-12");
    // 30 Sept 23:30 UTC is already 1 October in Prague.
    expect(currentMonth(new Date("2026-09-30T23:30:00Z"))).toBe("2026-10");
    expect(adminDeadline(new Date("2026-09-10T10:00:00Z"))).toBe("30 September");
    expect(adminDeadline(new Date("2028-02-10T10:00:00Z"))).toBe("29 February");
  });
});
