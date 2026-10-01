import { describe, expect, it } from "vitest";
import { parseClientRows } from "./client-import";

describe("parseClientRows", () => {
  it("reads name, surname and email columns", () => {
    const r = parseClientRows([
      ["Name", "Surname", "E-mail"],
      ["Anna", "Nováková", "Anna@Example.com"],
      ["", "", ""],
      ["Petr", "Svoboda", "not-an-email"],
      ["Jana", "Dvořáková", "anna@example.com"],
    ]);
    expect(r.clients).toEqual([{ firstName: "Anna", surname: "Nováková", email: "anna@example.com", row: 2 }]);
    expect(r.invalid).toEqual([4]);
    expect(r.duplicateInFile).toEqual([5]);
  });
  it("understands Czech headings and a heading row below a title", () => {
    const r = parseClientRows([["Klienti 2025"], ["Jméno", "Příjmení", "Email"], ["Eva", "Malá", "eva@example.cz"]]);
    expect(r.clients[0]).toMatchObject({ firstName: "Eva", surname: "Malá", email: "eva@example.cz" });
  });
  it("splits a single full-name column", () => {
    const r = parseClientRows([["Full name", "Email"], ["Marie Anna Černá", "m@example.com"]]);
    expect(r.clients[0]).toMatchObject({ firstName: "Marie", surname: "Anna Černá" });
  });
  it("says when the columns aren't there", () => {
    expect(parseClientRows([["a", "b"], ["c", "d"]]).missingColumns).toBeTruthy();
  });
});
