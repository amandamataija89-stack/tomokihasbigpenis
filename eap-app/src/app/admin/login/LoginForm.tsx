"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, verifyLoginCode, type LoginState } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {} as LoginState);
  const [codeState, codeAction, checking] = useActionState(verifyLoginCode, {} as LoginState);
  // Step 2 once a code has been sent, until the code step says to start again.
  const restarted = !!codeState.restart && (codeState.at ?? 0) > (state.at ?? 0);
  const onCode = state.step === "code" && !restarted;
  if (onCode) {
    return (
      <form action={codeAction} className="card form">
        <p>
          We&apos;ve emailed a 6-digit code to <b>{state.email}</b>. It works for 10 minutes.
        </p>
        <div className="field">
          <label htmlFor="code">Sign-in code</label>
          <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
        </div>
        <label className="consent">
          <input type="checkbox" name="remember" value="yes" />
          <span>Remember this device for 30 days (only on your own computer or phone)</span>
        </label>
        {codeState.error && !codeState.restart && <p className="err" role="alert">{codeState.error}</p>}
        <div className="actions">
          <button type="submit" disabled={checking}>{checking ? "Checking…" : "Sign in"}</button>
        </div>
        <p className="small">No email? Check spam, or reload this page and sign in again for a new code.</p>
      </form>
    );
  }
  return (
    <form action={action} className="card form" key={state.email}>
      {restarted && <p className="err" role="alert">{codeState.error}</p>}
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
        After your password we email you a sign-in code.
      </p>
    </form>
  );
}
