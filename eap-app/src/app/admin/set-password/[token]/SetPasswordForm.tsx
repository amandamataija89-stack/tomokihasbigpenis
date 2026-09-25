"use client";

import { useActionState } from "react";
import { setPassword } from "../../actions";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setPassword.bind(null, token), {});
  return (
    <form action={action} className="card form">
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required />
        <span className="small">At least 12 characters. A few words together is easy to remember.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Type it again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {state.error && <p className="err" id="pw-err" role="alert">{state.error}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save password and sign in"}</button>
      </div>
    </form>
  );
}
