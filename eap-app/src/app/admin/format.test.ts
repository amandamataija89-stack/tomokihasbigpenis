import { describe, expect, it } from "vitest";
import { toPragueInput } from "./format";

describe("toPragueInput", () => {
  it("shows times in Prague, summer and winter", () => {
    expect(toPragueInput(new Date("2026-09-30T12:00:00Z"))).toBe("2026-09-30T14:00");
    expect(toPragueInput(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-02T00:30");
  });
});
