"use client";

import { useActionState } from "react";
import { createCompany } from "../../actions";

export function NewCompanyForm() {
  const [state, action, pending] = useActionState(createCompany, {});
  return (
    <form action={action} className="card form">
      <h2>Add a client company</h2>
      <div className="row">
        <div className="field">
          <label htmlFor="name">Company name</label>
          <input id="name" name="name" type="text" placeholder="e.g. Vltava Software s.r.o." />
        </div>
        <div className="field">
          <label htmlFor="hrContact">HR contact<span className="opt">optional</span></label>
          <input id="hrContact" name="hrContact" type="text" placeholder="e.g. Petra Nováková, petra@vltava.cz" />
        </div>
      </div>
      {state.error && <p className="err" role="alert">{state.error}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create code and link"}</button>
      </div>
    </form>
  );
}
