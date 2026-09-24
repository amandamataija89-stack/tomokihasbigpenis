"use client";

import { useActionState } from "react";
import { addTherapist } from "../../actions";

export function AddTherapistForm({ languages }: { languages: readonly string[] }) {
  const [state, action, pending] = useActionState(addTherapist, {});
  return (
    <form action={action} className="card form">
      <h2>Add a therapist</h2>
      <div className="row">
        <div className="field">
          <label htmlFor="t-name">Name</label>
          <input id="t-name" name="name" type="text" />
        </div>
        <div className="field">
          <label htmlFor="t-email">Email</label>
          <input id="t-email" name="email" type="email" />
          <span className="small">They&apos;re emailed when a client is assigned to them.</span>
        </div>
      </div>
      <fieldset>
        <legend className="small">Works in<span className="opt">none ticked = any language</span></legend>
        <div className="choices">
          {languages.map((l) => (
            <label className="choice" key={l}>
              <input type="checkbox" name="languages" value={l} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="actions">
        <label htmlFor="t-cap" className="small">New clients per month</label>
        <input id="t-cap" name="capacity" type="number" min={0} max={100} defaultValue={5} className="cap-input" />
      </div>
      {state.error && <p className="err" role="alert">{state.error}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Adding…" : "Add therapist"}</button>
      </div>
    </form>
  );
}
