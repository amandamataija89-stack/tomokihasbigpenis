import { describe, expect, it } from "vitest";
import { chooseTherapist, type TherapistLoad } from "./assign";

const t = (name: string, assigned: number, extra: Partial<TherapistLoad> = {}): TherapistLoad => ({
  id: name,
  name,
  email: `${name}@example.com`,
  capacity: 5,
  languages: [],
  assignedThisMonth: assigned,
  lastAssignedAt: null,
  ...extra,
});

const pick = (ts: TherapistLoad[], lang = "English") => {
  const c = chooseTherapist(ts, lang);
  return c.therapist ? c.therapist.name : c.reason;
};

describe("chooseTherapist", () => {
  it("picks whoever has the fewest new clients this month", () => {
    expect(pick([t("Anna", 3), t("Boris", 1), t("Clara", 2)])).toBe("Boris");
  });

  it("breaks ties by who has waited longest", () => {
    expect(
      pick([
        t("Anna", 2, { lastAssignedAt: new Date("2026-09-20") }),
        t("Boris", 2, { lastAssignedAt: new Date("2026-09-03") }),
      ]),
    ).toBe("Boris");
  });

  it("never goes over a therapist's monthly limit", () => {
    expect(pick([t("Anna", 5), t("Boris", 5)])).toBe("all-full");
    expect(pick([t("Anna", 5), t("Boris", 4)])).toBe("Boris");
    expect(pick([t("Anna", 2, { capacity: 2 }), t("Boris", 3)])).toBe("Boris");
  });

  it("prefers therapists who work in the requested language", () => {
    const team = [t("Anna", 0, { languages: ["English"] }), t("Boris", 4, { languages: ["Czech", "Russian"] })];
    expect(pick(team, "Russian")).toBe("Boris");
    expect(pick(team, "Other")).toBe("Anna");
  });

  it("passes the case to another therapist when the language match is full, and flags it", () => {
    const team = [t("Anna", 1, { languages: ["English"] }), t("Boris", 5, { languages: ["Russian"] })];
    const c = chooseTherapist(team, "Russian");
    expect(c.therapist?.name).toBe("Anna");
    expect(c.therapist && c.languageMatch).toBe(false);
    expect(chooseTherapist(team, "English")).toMatchObject({ languageMatch: true });
  });

  it("gives 10 therapists 5 clients each over 50 requests, then stops", () => {
    const team = Array.from({ length: 10 }, (_, i) => t(`T${i}`, 0));
    for (let n = 0; n < 50; n++) {
      const c = chooseTherapist(team, "English");
      if (!c.therapist) throw new Error(`ran out at ${n}`);
      c.therapist.assignedThisMonth++;
      c.therapist.lastAssignedAt = new Date(2026, 8, 1, 0, n);
    }
    expect(team.map((x) => x.assignedThisMonth)).toEqual(Array(10).fill(5));
    expect(pick(team)).toBe("all-full");
  });

  it("reports when nobody takes clients", () => {
    expect(pick([])).toBe("no-therapists");
  });
});

describe("crisis cases", () => {
  it("go to the least-loaded therapist even when everyone is full", () => {
    const team = [t("Anna", 6), t("Boris", 5)];
    expect(pick(team)).toBe("all-full");
    expect(chooseTherapist(team, "English", true).therapist?.name).toBe("Boris");
  });

  it("still respect limits while someone has space", () => {
    expect(chooseTherapist([t("Anna", 0, { capacity: 0 }), t("Boris", 4)], "English", true).therapist?.name).toBe("Boris");
  });
});

describe("declined offers", () => {
  it("are not offered again to someone who declined", () => {
    expect(chooseTherapist([t("Anna", 0), t("Boris", 3)], "English", false, ["Anna"]).therapist?.name).toBe("Boris");
    expect(pick([t("Anna", 0)].filter(() => false))).toBe("no-therapists");
    expect(chooseTherapist([t("Anna", 0)], "English", false, ["Anna"])).toMatchObject({ reason: "no-therapists" });
  });
});
