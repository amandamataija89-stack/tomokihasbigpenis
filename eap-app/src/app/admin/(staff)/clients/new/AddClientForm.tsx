"use client";

import { useActionState, useState } from "react";
import { FORMATS, LANGUAGES, SERVICES } from "@/lib/request-form";
import { addClientAction, type AddClientState } from "../../../add-client-actions";

export function AddClientForm({
  manager,
  companies,
  counsellors,
}: {
  manager: boolean;
  companies: { id: string; name: string }[];
  counsellors: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(addClientAction, {} as AddClientState);
  const v = state.values ?? {};
  const [kind, setKind] = useState(v.kind === "eap" ? "eap" : "private");
  const text = (name: string, label: string, opts: { type?: string; optional?: boolean; area?: boolean } = {}) => (
    <div className="field">
      <label htmlFor={name}>{label}{opts.optional && <span className="opt">optional</span>}</label>
      {opts.area ? (
        <textarea id={name} name={name} rows={3} defaultValue={v[name]} />
      ) : (
        <input id={name} name={name} type={opts.type ?? "text"} defaultValue={v[name]} />
      )}
    </div>
  );
  const select = (name: string, label: string, options: readonly string[]) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={v[name] ?? ""}>
        <option value="" disabled>Choose one</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
  return (
    <form action={action} className="card form sections" key={JSON.stringify(v)}>
      {state.error && <p className="err" role="alert">{state.error}</p>}
      <fieldset>
        <legend>Kind of client</legend>
        <div className="choices">
          <label className="choice">
            <input type="radio" name="kind" value="private" checked={kind === "private"} onChange={() => setKind("private")} />
            <span>Private (Prague Integration client)</span>
          </label>
          <label className="choice">
            <input type="radio" name="kind" value="eap" checked={kind === "eap"} onChange={() => setKind("eap")} />
            <span>EAP (through their employer)</span>
          </label>
        </div>
      </fieldset>
      {kind === "eap" && (
        <div className="field">
          <label htmlFor="companyId">Company</label>
          <select id="companyId" name="companyId" defaultValue={v.companyId ?? ""}>
            <option value="" disabled>Choose the company</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="row">
        {text("firstName", "Name they want to be called")}
        {text("fullName", "First name and surname", { optional: kind === "eap" })}
      </div>
      <div className="row">
        {text("email", "Email", { type: "email" })}
        {text("phone", "Phone", { type: "tel", optional: true })}
      </div>
      {kind === "private" && text("address", "Residential address (for invoices)", { area: true, optional: true })}
      {kind === "private" && select("service", "Type of counselling", SERVICES)}
      <div className="row">
        {select("language", "Language", LANGUAGES)}
        {select("format", "Online or in person", FORMATS)}
      </div>
      {text("message", "What they need help with / notes from the first contact", { area: true, optional: true })}
      {manager && (
        <div className="field">
          <label htmlFor="counsellor">Counsellor</label>
          <select id="counsellor" name="counsellor" defaultValue={v.counsellor ?? ""}>
            <option value="">{kind === "eap" ? "Offer automatically, as usual" : "Nobody yet (assign later)"}</option>
            {counsellors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <label className="consent">
        <input type="checkbox" name="crisis" value="yes" defaultChecked={v.crisis === "yes"} />
        <span><b>Crisis case</b>: needs contact as soon as possible</span>
      </label>
      <label className="consent">
        <input type="checkbox" name="consent" value="yes" />
        <span>The client agreed to be contacted and to their details being stored and shared with their counsellor (see the Privacy Policy).</span>
      </label>
      <label className="consent">
        <input type="checkbox" name="welcome" value="yes" defaultChecked />
        <span>Email the client a confirmation with their private page link</span>
      </label>
      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Adding…" : "Add client"}</button>
      </div>
    </form>
  );
}
