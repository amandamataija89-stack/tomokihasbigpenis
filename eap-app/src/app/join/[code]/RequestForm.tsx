"use client";

import { useActionState } from "react";
import { AGE_RANGES, CONTACT_METHODS, FORMATS, GENDERS, LANGUAGES, TOPICS } from "@/lib/request-form";
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

  const select = (name: "language" | "format" | "ageRange" | "gender", label: string, options: readonly string[]) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={v[name] ?? ""} {...invalid(name)}>
        <option value="" disabled>
          Choose one
        </option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      {err(name)}
    </div>
  );

  return (
    <form action={action} className="card form sections" noValidate key={key}>
      {state.formError && <p className="err" role="alert">{state.formError}</p>}
      {Object.keys(e).length > 0 && (
        <p className="err" role="alert">
          Some answers need attention. They&apos;re marked below.
        </p>
      )}

      <section className="form-section">
        <h2>What&apos;s going on</h2>
        <fieldset className="urgent-q" {...invalid("crisis")}>
          <legend>Do you need help urgently?</legend>
          <div className="choices">
            <label className="choice">
              <input type="radio" name="crisis" value="yes" defaultChecked={v.crisis === "yes"} />
              <span>Yes, I&apos;m struggling to cope right now</span>
            </label>
            <label className="choice">
              <input type="radio" name="crisis" value="no" defaultChecked={v.crisis === "no"} />
              <span>No, it&apos;s not urgent</span>
            </label>
          </div>
          <p className="small">
            If you are in danger or thinking about harming yourself, please call <b>112</b> or <b>116 123</b> now
            rather than waiting for us.
          </p>
          {err("crisis")}
        </fieldset>

        <fieldset {...invalid("topics")}>
          <legend>
            What would you like support with?<span className="opt">choose any, or write below</span>
          </legend>
          <div className="choices">
            {TOPICS.map((t) => (
              <label className="choice" key={t}>
                <input type="checkbox" name="topics" value={t} defaultChecked={v.topics?.includes(t)} />
                <span>{t}</span>
              </label>
            ))}
          </div>
          {err("topics")}
        </fieldset>

        <div className="field">
          <label htmlFor="message">
            In your own words<span className="opt">optional if you chose a topic</span>
          </label>
          <textarea
            id="message"
            name="message"
            maxLength={2000}
            defaultValue={v.message}
            placeholder="e.g. I haven't been sleeping since my move, and work feels overwhelming"
          />
        </div>
      </section>

      <section className="form-section">
        <h2>About you</h2>
        <div className="row">
          <div className="field">
            <label htmlFor="firstName">Nickname</label>
            <input id="firstName" name="firstName" type="text" autoComplete="nickname" defaultValue={v.firstName} {...invalid("firstName")} />
            <span className="small">Any name you&apos;d like us to call you. It doesn&apos;t have to be your real name.</span>
            {err("firstName")}
          </div>
          <div className="field">
            <label htmlFor="fullName">
              Full name<span className="opt">optional</span>
            </label>
            <input id="fullName" name="fullName" type="text" autoComplete="name" defaultValue={v.fullName} />
            <span className="small">Only needed if you want an invoice for insurance.</span>
          </div>
        </div>
        <div className="row">{select("ageRange", "Age", AGE_RANGES)}</div>
        <div className="row">
          {select("gender", "Gender", GENDERS)}
          <div className="field">
            <label htmlFor="location">Where are you based?</label>
            <input
              id="location"
              name="location"
              type="text"
              autoComplete="address-level2"
              placeholder="e.g. Prague 3, Brno, working remotely from Spain"
              defaultValue={v.location}
              {...invalid("location")}
            />
            {err("location")}
          </div>
        </div>
      </section>

      <section className="form-section">
        <h2>Your sessions</h2>
        <div className="row">
          {select("format", "Online or in person?", FORMATS)}
          {select("language", "Language", LANGUAGES)}
        </div>
      </section>

      <section className="form-section">
        <h2>How we reach you</h2>
        <div className="row">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" defaultValue={v.email} {...invalid("email")} />
            <span className="small">A personal address is fine if you prefer.</span>
            {err("email")}
          </div>
          <div className="field">
            <label htmlFor="phone">
              Phone<span className="opt">needed for calls and texts</span>
            </label>
            <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+420" defaultValue={v.phone} {...invalid("phone")} />
            {err("phone")}
          </div>
        </div>
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
      </section>

      <div className="hp" aria-hidden="true">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="consents">
        <legend>Your consent</legend>
        <div className="field">
          <label className="consent">
            <input type="checkbox" name="consentContact" value="yes" {...invalid("consentContact")} />
            <span>
              I agree that Prague Integration may <b>contact me</b> about this request, in the way I chose above.
            </span>
          </label>
          {err("consentContact")}
        </div>
        <div className="field">
          <label className="consent">
            <input type="checkbox" name="consent" value="yes" {...invalid("consent")} />
            <span>
              I agree that Prague Integration s.r.o. may <b>store the information</b> in this form, including anything
              about my wellbeing, and <b>share it with the counsellor and coordinator</b> who handle my request. It is
              never shared with my employer.
            </span>
          </label>
          {err("consent")}
        </div>
        <p className="small">
          You can withdraw your consent or ask for your information to be deleted at any time by writing to
          contact@pragueintegration.cz.
        </p>
      </fieldset>

      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send my request"}
        </button>
      </div>
    </form>
  );
}
