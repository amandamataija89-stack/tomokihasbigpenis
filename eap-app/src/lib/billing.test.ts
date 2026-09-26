import { describe, expect, it } from "vitest";
import { nextInvoiceNumber, parsePrice, priceSteps, qrPlatba, vatSplit, withVat } from "./billing";
import { invoiceLines, renderInvoice, taxDate } from "./invoice-pdf";
import { DEFAULT_INVOICE_SETTINGS } from "./billing";

describe("invoice numbers", () => {
  it("count up, keeping the width", () => {
    expect(nextInvoiceNumber("2026001")).toBe("2026002");
    expect(nextInvoiceNumber("FV-2026-009")).toBe("FV-2026-010");
    expect(nextInvoiceNumber("99")).toBe("100");
  });
});

describe("parsePrice", () => {
  it("accepts whole CZK written in common ways", () => {
    expect(parsePrice("1500")).toBe(1500);
    expect(parsePrice("1 500 Kč")).toBe(1500);
    expect(parsePrice("1,500 CZK")).toBe(1500);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("abc")).toBeUndefined();
  });
});

describe("invoice", () => {
  const sessions = [
    { starts_at: new Date("2026-10-05T08:00:00Z"), price_czk: 1500, late_cancelled: false },
    { starts_at: new Date("2026-10-12T08:00:00Z"), price_czk: 1500, late_cancelled: true },
  ];
  it("shows the service with sessions × price and the dates under it, plus an adjustment", () => {
    const lines = invoiceLines("Couple counselling", 2800, null, sessions);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Mental Health Counselling Services – Couples: 2 × 1 500 Kč");
    expect(lines[0].amount).toBe(3000);
    expect(lines[0].detail).toContain("late cancellation");
    expect(lines[1]).toEqual({ text: "Úprava ceny / Price adjustment", amount: -200 });
  });
  it("shows a package as one line", () => {
    expect(invoiceLines("Individual counselling", 6500, { sessions: 5 }, [])).toEqual([
      { text: "Mental Health Counselling Services – Individual – balíček / package of 5 sessions", amount: 6500 },
    ]);
  });
  it("renders a PDF with Czech letters", async () => {
    const pdf = await renderInvoice({
      number: "2026001",
      issuedOn: new Date("2026-10-13T10:00:00Z"),
      paidOn: "2026-10-12",
      dueOn: null,
      variableSymbol: "100001",
      period: null,
      sessionCount: 2,
      qr: null,
      taxDate: "2026-10-12",
      method: "Bank transfer",
      customer: ["Jana Nováková", "Vinohradská 12", "120 00 Praha 2"],
      lines: invoiceLines("Individual counselling", 3000, null, sessions),
      total: 3000,
      supplier: { ...DEFAULT_INVOICE_SETTINGS, ico: "12345678", bankAccount: "123456789/0800" },
    });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
  });
});

describe("VAT", () => {
  it("splits a price that includes 21 % VAT", () => {
    expect(vatSplit(1500, 21)).toEqual({ base: 123967, vat: 26033, gross: 150000 });
    expect(vatSplit(2600, 21)).toEqual({ base: 214876, vat: 45124, gross: 260000 });
    expect(vatSplit(1000, 0)).toEqual({ base: 100000, vat: 0, gross: 100000 });
  });
  it("taxes a payment on the earlier of payment and the last session", () => {
    const oct5 = new Date("2026-10-05T08:00:00Z");
    const oct12 = new Date("2026-10-12T08:00:00Z");
    expect(taxDate("2026-10-20", [oct5, oct12])).toBe("2026-10-12"); // paid after the sessions
    expect(taxDate("2026-10-01", [oct5, oct12])).toBe("2026-10-01"); // paid in advance
    expect(taxDate("2026-10-01", [])).toBe("2026-10-01"); // a package
  });
});

describe("price ranges", () => {
  it("offer steps of 100 without VAT", () => {
    expect(priceSteps(1400, 1600)).toEqual([1400, 1500, 1600]);
    expect(priceSteps(900, 2300)).toHaveLength(15);
    expect(priceSteps(950, 1200)).toEqual([950, 1050, 1150, 1200]);
    expect(priceSteps(1500, 1500)).toEqual([1500]);
  });
  it("add VAT on top", () => {
    expect(withVat(1500, { vatPayer: true, vatRate: 21 })).toBe(1815);
    expect(withVat(900, { vatPayer: true, vatRate: 21 })).toBe(1089);
    expect(withVat(1500, { vatPayer: false, vatRate: 21 })).toBe(1500);
    // Whole hundreds at 21 % give whole crowns, so the invoice's tax base is exactly the chosen price.
    expect(vatSplit(withVat(2300, { vatPayer: true, vatRate: 21 }), 21).base).toBe(230000);
  });
});

describe("QR Platba", () => {
  it("carries the account, amount, variable symbol and a plain message", () => {
    expect(qrPlatba({ iban: "CZ45 5500 0000 0054 5438 7003", amountCzk: 9075, variableSymbol: "100002", message: "Faktura 2026041 – září" })).toBe(
      "SPD*1.0*ACC:CZ4555000000005454387003*AM:9075.00*CC:CZK*X-VS:100002*MSG:Faktura 2026041 – zari",
    );
  });
});
