"use client";

import { useActionState, useState } from "react";
import { SignaturePad } from "@/components/SignaturePad";
import { signConsent, type ConsentState } from "./actions";

export function ConsentForm({ token, email, fullName, address }: { token: string; email: string; fullName: string; address: string }) {
  const [state, action, pending] = useActionState(signConsent.bind(null, token), {} as ConsentState);
  const e = state.errors ?? {};
  const v = state.values ?? {};
  const [minor, setMinor] = useState(v.forMinor === "yes");
  const err = (k: keyof typeof e) => (e[k] ? <span className="err" id={`${k}-err`}>{e[k]}</span> : null);
  const inv = (k: keyof typeof e) => (e[k] ? { "aria-invalid": true as const, "aria-describedby": `${k}-err` } : {});
  const text = (name: string, label: string, def = "", opts: { optional?: boolean; area?: boolean; type?: string } = {}) => (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {opts.optional && <span className="opt">optional</span>}
      </label>
      {opts.area ? (
        <textarea id={name} name={name} rows={2} defaultValue={v[name] ?? def} {...inv(name as keyof typeof e)} />
      ) : (
        <input id={name} name={name} type={opts.type ?? "text"} defaultValue={v[name] ?? def} {...inv(name as keyof typeof e)} />
      )}
      {err(name as keyof typeof e)}
    </div>
  );

  return (
    <form action={action} className="card form sections" noValidate key={JSON.stringify(v)}>
      {state.formError && <p className="err" role="alert">{state.formError}</p>}
      {Object.keys(e).length > 0 && <p className="err" role="alert">Some answers need attention. They&apos;re marked below.</p>}

      <section className="form-section">
        <h2>Client contact information</h2>
        {text("fullName", "Client's name and surname", fullName)}
        {text("localAddress", "Residential address in Prague", address, { area: true })}
        {text("homeAddress", "Permanent address, if different (e.g. abroad)", "", { optional: true, area: true })}
        <div className="row">
          {text("phone", "Contact telephone number", "", { type: "tel" })}
          {text("email", "Email address", email, { type: "email" })}
        </div>
      </section>

      <section className="form-section">
        <h2>Emergency contact</h2>
        <p className="small">Required: someone we may contact if we have serious concerns for your safety. Please let them know.</p>
        {text("emergencyName", "Name of contact")}
        {text("emergencyContact", "Relationship, email / telephone")}
        {text("otherInfo", "Any other relevant information", "", { optional: true, area: true })}
      </section>

      <section className="form-section">
        <h2>Agreement &amp; signature</h2>
        <label className="consent">
          <input type="checkbox" name="forMinor" value="yes" checked={minor} onChange={(x) => setMinor(x.target.checked)} />
          <span>The client is under 18 and I am their parent or legal guardian, signing on their behalf.</span>
        </label>
        {minor && text("guardianName", "Full name of parent or guardian")}
        <div className="field">
          <label className="consent">
            <input type="checkbox" name="agree" value="yes" {...inv("agree")} />
            <span>
              I have read and understood this informed consent form and agree to its terms, including the cancellation
              policy and fees.
            </span>
          </label>
          {err("agree")}
        </div>
        <p className="small">
          How we look after your data: our <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
        </p>
        {text("signedName", minor ? "Type the parent's or guardian's full name" : "Type your full name")}
        <div className="field">
          <label>Signature</label>
          <SignaturePad name="signature" invalid={!!e.signaturePng} />
          {err("signaturePng")}
        </div>
      </section>

      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Signing…" : "Sign the consent form"}</button>
      </div>
    </form>
  );
}
