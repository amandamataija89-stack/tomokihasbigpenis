"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPassword } from "../actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPassword, {});
  if (state.sent)
    return (
      <div className="card stack">
        <p>
          If that address has a staff login, we&apos;ve emailed it a link to choose a new password. The link works
          for 1 hour.
        </p>
        <Link href="/admin/login">Back to sign in</Link>
      </div>
    );
  return (
    <form action={action} className="card form">
      <div className="field">
        <label htmlFor="email">Your work email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Sending…" : "Email me a reset link"}</button>
        <Link href="/admin/login" className="small">Back to sign in</Link>
      </div>
    </form>
  );
}
