"use client";

import { useActionState } from "react";
import { setupFirstAdmin } from "../actions";

export function SetupForm() {
  const [state, action, pending] = useActionState(setupFirstAdmin, {});
  return (
    <form action={action} className="card form" key={`${state.name}|${state.email}|${state.error}`}>
      <div className="field">
        <label htmlFor="setupCode">Setup code</label>
        <input id="setupCode" name="setupCode" type="password" autoComplete="off" required />
        <span className="small">The SETUP_CODE you typed into Vercel&apos;s environment variables.</span>
      </div>
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" type="text" autoComplete="name" required defaultValue={state.name} />
      </div>
      <div className="field">
        <label htmlFor="email">Your email</label>
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} />
      </div>
      <div className="field">
        <label htmlFor="password">Choose a password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required />
        <span className="small">At least 12 characters. A few words together is easy to remember.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Type it again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {state.error && <p className="err" id="setup-err" role="alert">{state.error}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create admin login"}</button>
      </div>
    </form>
  );
}
