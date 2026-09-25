"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="card form" key={state.email}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && <p className="err" id="login-err" role="alert">{state.error}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        <Link href="/admin/forgot" className="small">Forgot your password?</Link>
      </div>
      <p className="small">
        New to the team? Your coordinator adds you, and you get an email with a link to choose your password.
      </p>
    </form>
  );
}
