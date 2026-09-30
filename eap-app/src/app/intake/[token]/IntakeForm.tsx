"use client";

import { useActionState } from "react";
import { SignaturePad } from "@/components/SignaturePad";
import { DECLARATION, FREQUENCY, RELATIONSHIP, SYMPTOMS } from "@/lib/intake-options";
import { submitIntake, type IntakeState } from "./actions";

type Prefill = { firstName: string; lastName: string; email: string; phone: string; gender: string };

export function IntakeForm({ token, prefill }: { token: string; prefill: Prefill }) {
  const [state, action, pending] = useActionState(submitIntake.bind(null, token), {} as IntakeState);
  const e = state.errors ?? {};
  const v = (state.values ?? {}) as Record<string, string | string[] | undefined>;
  const val = (k: string, d = "") => (typeof v[k] === "string" ? (v[k] as string) : d);
  const err = (k: keyof typeof e) => (e[k] ? <span className="err" id={`${k}-err`}>{e[k]}</span> : null);
  const inv = (k: keyof typeof e) => (e[k] ? { "aria-invalid": true as const, "aria-describedby": `${k}-err` } : {});
  const text = (name: keyof typeof e, label: string, d = "", type = "text") => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={val(name, d)} {...inv(name)} />
      {err(name)}
    </div>
  );
  const area = (name: string, label: string, optional = true) => (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {optional && <span className="opt">optional</span>}
      </label>
      <textarea id={name} name={name} rows={3} defaultValue={val(name)} {...inv(name as keyof typeof e)} />
      {err(name as keyof typeof e)}
    </div>
  );
  const yn = (name: keyof typeof e, label: string, details?: { name: string; label: string }) => (
    <fieldset {...inv(name)}>
      <legend>{label}</legend>
      <div className="choices">
        {(["yes", "no"] as const).map((x) => (
          <label className="choice" key={x}>
            <input type="radio" name={name} value={x} defaultChecked={val(name) === x} />
            <span>{x === "yes" ? "Yes" : "No"}</span>
          </label>
        ))}
      </div>
      {err(name)}
      {details && area(details.name, details.label)}
    </fieldset>
  );

  return (
    <form action={action} className="card form sections" noValidate key={JSON.stringify(v)}>
      {state.formError && <p className="err" role="alert">{state.formError}</p>}
      {Object.keys(e).length > 0 && <p className="err" role="alert">Some answers need attention. They&apos;re marked below.</p>}

      <section className="form-section">
        <h2>About you</h2>
        <div className="row">
          {text("lastName", "Last name", prefill.lastName)}
          {text("firstName", "First name", prefill.firstName)}
        </div>
        <div className="row">
          {text("dateOfBirth", "Date of birth", "", "date")}
          {text("gender", "Gender", prefill.gender)}
        </div>
        <div className="row">
          {text("phone", "Telephone number", prefill.phone, "tel")}
          {text("email", "E-mail", prefill.email, "email")}
        </div>
        {text("countryOfOrigin", "Country of origin")}
        <fieldset {...inv("relationship")}>
          <legend>Relationship status</legend>
          <div className="choices">
            {RELATIONSHIP.map((x) => (
              <label className="choice" key={x}>
                <input type="radio" name="relationship" value={x} defaultChecked={val("relationship") === x} />
                <span>{x}</span>
              </label>
            ))}
          </div>
          {err("relationship")}
        </fieldset>
        {yn("livesInCz", "I live in the Czech Republic")}
      </section>

      <section className="form-section">
        <h2>Medical history</h2>
        {area("illnesses", "1. Please list any significant illnesses, surgeries, or hospitalizations")}
        {area("medications", "2. Please list any medications you are taking, or have taken")}
      </section>

      <section className="form-section">
        <h2>Mental health</h2>
        <fieldset>
          <legend>In the last two weeks, have you experienced one or more of the following? (check all that apply)</legend>
          <div className="choices">
            {SYMPTOMS.map((x) => (
              <label className="choice" key={x}>
                <input type="checkbox" name="symptoms" value={x} defaultChecked={Array.isArray(v.symptoms) && v.symptoms.includes(x)} />
                <span>{x}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset {...inv("frequency")}>
          <legend>In the last two weeks I have experienced one, or more of the above:</legend>
          <div className="choices">
            {FREQUENCY.map((x) => (
              <label className="choice" key={x}>
                <input type="radio" name="frequency" value={x} defaultChecked={val("frequency") === x} />
                <span>{x}</span>
              </label>
            ))}
          </div>
          {err("frequency")}
        </fieldset>
      </section>

      <section className="form-section">
        <h2>Mental health history</h2>
        {yn("familyHistory", "1. Has anyone in your family suffered from mental health difficulties?", { name: "familyHistoryDetails", label: "If “Yes”, please describe" })}
        {yn("harmThoughts", "2. Have you had any thoughts of harming yourself or others?", { name: "harmDetails", label: "If “Yes”, please describe" })}
        <p className="small">If you are in danger right now, please call 112 or 116 123 (free, 24/7) rather than waiting for us.</p>
        {yn("previousHelp", "3. Have you sought any psychological consultation before?", { name: "previousHelpDetails", label: "If “Yes”, please write approx. period(s) of treatment" })}
        {yn("addiction", "4. Have you had any history of addiction, or currently experience problems with alcohol, drugs or others?", { name: "addictionDetails", label: "If “Yes”, please specify" })}
        {area("motivation", "5. In your own words, please describe your motivation in joining Prague Integration sessions", false)}
        {area("questions", "6. Is there anything else you would like to add or ask on your discovery call?")}
      </section>

      <section className="form-section">
        <h2>Declaration</h2>
        <ul className="small declaration">
          {DECLARATION.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
        <div className="field">
          <label className="consent">
            <input type="checkbox" name="declaration" value="yes" {...inv("declaration")} />
            <span>I, the undersigned, declare and confirm the above.</span>
          </label>
          {err("declaration")}
        </div>
        <p className="small">
          How we look after your data: our <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
        </p>
        {text("signedName", "Client's name (type your full name)")}
        <div className="field">
          <label>Signature</label>
          <SignaturePad name="signature" invalid={!!e.signaturePng} />
          {err("signaturePng")}
        </div>
      </section>

      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Sending…" : "Send my intake form"}</button>
      </div>
    </form>
  );
}
