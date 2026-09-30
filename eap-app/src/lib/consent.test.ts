import { describe, expect, it } from "vitest";
import { validateConsent } from "./consent";

const sig = "data:image/png;base64," + "A".repeat(2000);
const form = (f: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(f)) d.append(k, v);
  return d;
};
const valid = {
  fullName: "Jana Nováková",
  localAddress: "Vinohradská 12, 120 00 Praha 2",
  phone: "+420 777 123 456",
  email: "jana@example.com",
  emergencyName: "Petr Novák",
  emergencyContact: "Husband, +420 777 000 111",
  signedName: "jana  nováková",
  signature: sig,
  agree: "yes",
};

describe("consent form", () => {
  it("accepts a complete form signed by the client", () => {
    const r = validateConsent(form(valid));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.signaturePng).toBe("A".repeat(2000));
  });
  it("requires an emergency contact, a drawn signature, agreement and the typed name to match", () => {
    const r = validateConsent(form({ ...valid, emergencyName: "", signature: "", agree: "", signedName: "Someone Else" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.emergencyName).toBeTruthy();
      expect(r.errors.signaturePng).toBeTruthy();
      expect(r.errors.agree).toBeTruthy();
      expect(r.errors.signedName).toBeTruthy();
    }
  });
  it("for a minor, the parent or guardian signs with their own name", () => {
    const noGuardian = validateConsent(form({ ...valid, forMinor: "yes" }));
    expect(!noGuardian.ok && noGuardian.errors.guardianName).toBeTruthy();
    const ok = validateConsent(form({ ...valid, forMinor: "yes", guardianName: "Eva Nováková", signedName: "Eva Nováková" }));
    expect(ok.ok && ok.data.guardianName).toBe("Eva Nováková");
  });
});

describe("consent form addresses", () => {
  it("requires the residential address in Prague and an emergency contact; the permanent address is optional", () => {
    const r = validateConsent(form({ ...valid, localAddress: "", emergencyName: "", emergencyContact: "" }));
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["emergencyContact", "emergencyName", "localAddress"]);
    expect(validateConsent(form({ ...valid, homeAddress: "" })).ok).toBe(true);
  });
});
