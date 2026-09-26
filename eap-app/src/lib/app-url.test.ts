import { describe, expect, it } from "vitest";
import { appUrl } from "./app-url";

describe("appUrl", () => {
  it("uses APP_URL when it's a web address", () => {
    expect(appUrl({ APP_URL: " https://eap.example.cz/ " })).toBe("https://eap.example.cz");
  });
  it("ignores an APP_URL that isn't a web address and uses Vercel's", () => {
    expect(
      appUrl({ APP_URL: "Prague Integration <contact@pragueintegration.cz>", VERCEL_PROJECT_PRODUCTION_URL: "prague-eap.vercel.app" }),
    ).toBe("https://prague-eap.vercel.app");
  });
  it("falls back to localhost", () => {
    expect(appUrl({})).toBe("http://localhost:3000");
  });
});
