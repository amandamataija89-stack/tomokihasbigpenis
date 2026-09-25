import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("passwords", () => {
  it("verifies the right password and rejects others", () => {
    const stored = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", stored)).toBe(true);
    expect(verifyPassword("correct horse batterY", stored)).toBe(false);
  });

  it("rejects malformed stored values", () => {
    expect(verifyPassword("x", "plain-text")).toBe(false);
  });
});
