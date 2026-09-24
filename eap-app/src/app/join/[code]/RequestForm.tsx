"use client";

import { useActionState } from "react";
import { CONTACT_METHODS, FORMATS, LANGUAGES, TOPICS } from "@/lib/request-form";
import { submitRequest, type SubmitState } from "./actions";

export function RequestForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState(submitRequest.bind(null, code), {} as SubmitState);
  const e = state.errors ?? {};
  const v = state.values ?? {};
  // Re-keying on each response resets the uncontrolled inputs to the values the server echoed back.
  const key = JSON.stringify(v);

  const err = (name: keyof typeof e) =>
    e[name] ? (
      <span id={`${name}-err`} className="err">
        {e[name]}
      </span>
    ) : null;
  const invalid = (name: keyof typeof e) =>
    e[name] ? { "aria-invalid": true as const, "aria-describedby": `${name}-err` } : {};

  return (
    <form action={action} className="card form" noValidate key={key}>
      {state.formError && <p className="err" role="alert">{state.formError}</p>}
      {Object.keys(e).length > 0 && (
        <p className="err" role="alert">
          Some answers need attention. They&apos;re marked below.
        </p>
      )}

      <div className="row">
        <div className="field">
          <label htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" type="text" autoComplete="given-name" defaultValue={v.firstName} {...invalid("firstName")} />
          <span className="small">Or any name you&apos;d like us to use.</span>
          {err("firstName")}
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={v.email} {...invalid("email")} />
          <span className="small">A personal address is fine if you prefer.</span>
          {err("email")}
        </div>
      </div>

      <div className="row">
        <fieldset>
          <legend>How should we contact you?</legend>
          <div className="choices">
            {CONTACT_METHODS.map((m) => (
              <label className="choice" key={m}>
                <input type="radio" name="contactMethod" value={m} defaultChecked={(v.contactMethod ?? "Email") === m} />
                <span>{m}</span>
              </label>
            ))}
          </div>
          {err("contactMethod")}
        </fieldset>
        <div className="field">
          <label htmlFor="phone">
            Phone<span className="opt">needed for calls and texts</span>
          </label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+420" defaultValue={v.phone} {...invalid("phone")} />
          {err("phone")}
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="language">Language for your sessions</label>
          <select id="language" name="language" defaultValue={v.language ?? ""} {...invalid("language")}>
            <option value="" disabled>
              Choose one
            </option>
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          {err("language")}
        </div>
        <div className="field">
          <label htmlFor="format">How would you like to meet?</label>
          <select id="format" name="format" defaultValue={v.format ?? ""} {...invalid("format")}>
            <option value="" disabled>
              Choose one
            </option>
            {FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          {err("format")}
        </div>
      </div>

      <fieldset>
        <legend>
          What would you like support with?<span className="opt">optional, choose any</span>
        </legend>
        <div className="choices">
          {TOPICS.map((t) => (
            <label className="choice" key={t}>
              <input type="checkbox" name="topics" value={t} defaultChecked={v.topics?.includes(t)} />
              <span>{t}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="message">
          Anything you&apos;d like us to know<span className="opt">optional</span>
        </label>
        <textarea
          id="message"
          name="message"
          maxLength={2000}
          defaultValue={v.message}
          placeholder="e.g. best times to reach you, or whether you'd prefer a female or male counsellor"
        />
      </div>

      <div className="hp" aria-hidden="true">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="field">
        <label className="consent">
          <input type="checkbox" name="consent" value="yes" {...invalid("consent")} />
          <span>
            I agree that Prague Integration s.r.o. may store the information in this form, including anything about
            my wellbeing, to contact me and arrange support. I can ask for it to be deleted at any time by writing to
            contact@pragueintegration.cz.
          </span>
        </label>
        {err("consent")}
      </div>

      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send my request"}
        </button>
      </div>
    </form>
  );
}
