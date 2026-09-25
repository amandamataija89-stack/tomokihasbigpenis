import { describe, expect, it } from "vitest";
import { generateCompanyCode, normalizeCompanyCode } from "./codes";

describe("company codes", () => {
  it("generates codes that normalize to themselves", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCompanyCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(normalizeCompanyCode(code)).toBe(code);
    }
  });

  it("accepts lowercase, spaces and missing dash", () => {
    expect(normalizeCompanyCode(" abcd efgh ")).toBe("ABCD-EFGH");
    expect(normalizeCompanyCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("rejects wrong length and ambiguous characters", () => {
    expect(normalizeCompanyCode("ABC-EFGH")).toBeNull();
    expect(normalizeCompanyCode("ABCD-EFG0")).toBeNull();
    expect(normalizeCompanyCode("")).toBeNull();
  });
});
