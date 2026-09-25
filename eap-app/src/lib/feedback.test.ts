import { describe, expect, it } from "vitest";
import { parseFeedback } from "./feedback";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};

describe("parseFeedback", () => {
  it("accepts the required answers and an optional counsellor rating", () => {
    const r = parseFeedback(form({ overall: "5", helped: "Yes, a lot", recommend: "Yes", comments: "  Thanks  " }));
    expect(r).toEqual({
      ok: true,
      data: { overall: 5, counsellorRating: null, helped: "Yes, a lot", recommend: "Yes", comments: "Thanks" },
    });
  });

  it("rejects missing or out-of-range answers", () => {
    expect(parseFeedback(form({ overall: "6", helped: "Somewhat", recommend: "No" })).ok).toBe(false);
    expect(parseFeedback(form({ overall: "3", helped: "Kind of", recommend: "No" })).ok).toBe(false);
    expect(parseFeedback(form({ overall: "3", helped: "Somewhat" })).ok).toBe(false);
  });
});
