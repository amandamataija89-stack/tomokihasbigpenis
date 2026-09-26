import { describe, expect, it } from "vitest";
import { decodeStatement, parseAmount, parseDate, parseStatement } from "./bank-statement";

describe("bank statement", () => {
  it("reads amounts and dates written the Czech way", () => {
    expect(parseAmount("1 815,00")).toBe(1815);
    expect(parseAmount("1.815,00")).toBe(1815);
    expect(parseAmount("-9075.00")).toBe(-9075);
    expect(parseAmount("9 075 CZK")).toBe(9075);
    expect(parseDate("12.10.2026")).toBe("2026-10-12");
    expect(parseDate("2. 9. 2026 14:03")).toBe("2026-09-02");
    expect(parseDate("2026-10-12")).toBe("2026-10-12");
  });
  it("reads a Raiffeisen-style CSV with a VS column", () => {
    const csv = [
      "Výpis z účtu 5454387003/5500",
      "",
      '"Datum provedení";"Datum zaúčtování";"Číslo protiúčtu";"Název protiúčtu";"Zaúčtovaná částka";"Měna účtu";"VS";"KS";"SS";"Zpráva"',
      '"12.10.2026";"12.10.2026";"123456789/0800";"NOVAKOVA JANA";"9 075,00";"CZK";"100002";"";"";"Faktura 2026041"',
      '"13.10.2026";"13.10.2026";"";"Vodafone";"-499,00";"CZK";"";"";"";""',
    ].join("\r\n");
    const t = parseStatement(csv);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ date: "2026-10-12", amount: 9075, vs: "100002", counterparty: "NOVAKOVA JANA" });
    expect(t[1].amount).toBe(-499);
  });
  it("finds the VS in the message when there's no VS column, and handles windows-1250", () => {
    const text = "Datum,Částka,Zpráva\n2026-10-12,3025.00,/VS/100003 platba\n";
    const bytes = new Uint8Array([...Buffer.from(text.replace("Č", "È").replace("á", "á"), "latin1")]);
    const t = parseStatement(decodeStatement(bytes));
    expect(t[0]).toMatchObject({ amount: 3025, vs: "100003" });
  });
  it("explains a file it can't read", () => {
    expect(() => parseStatement("hello\nworld")).toThrow(/export the statement as CSV/);
  });
  it("keeps two identical payments as two", () => {
    const csv = "Datum;Částka;VS\n1.10.2026;100;1\n1.10.2026;100;1\n";
    const [a, b] = parseStatement(csv);
    expect(a.key).not.toBe(b.key);
  });
});
