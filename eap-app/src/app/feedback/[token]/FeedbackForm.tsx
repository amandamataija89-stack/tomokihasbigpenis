"use client";

import { useActionState } from "react";
import { HELPED, RECOMMEND } from "@/lib/feedback-options";
import { sendFeedback, type FeedbackState } from "./actions";

type Picked = { picked?: string };

const Scale = ({ name, low, high, picked }: { name: string; low: string; high: string } & Picked) => (
  <div className="stack" style={{ gap: 6 }}>
    <div className="choices scale">
      {[1, 2, 3, 4, 5].map((n) => (
        <label className="choice" key={n}>
          <input type="radio" name={name} value={n} defaultChecked={picked === String(n)} />
          <span>{n}</span>
        </label>
      ))}
    </div>
    <span className="small">1 = {low} · 5 = {high}</span>
  </div>
);

const Choices = ({ name, options, picked }: { name: string; options: readonly string[] } & Picked) => (
  <div className="choices">
    {options.map((o) => (
      <label className="choice" key={o}>
        <input type="radio" name={name} value={o} defaultChecked={picked === o} />
        <span>{o}</span>
      </label>
    ))}
  </div>
);

export function FeedbackForm({ token, counsellorName }: { token: string; counsellorName: string | null }) {
  const [state, action, pending] = useActionState(sendFeedback.bind(null, token), {} as FeedbackState);
  const v = state.values ?? {};
  return (
    // Re-keyed on each response so the inputs pick up the answers echoed back.
    <form action={action} className="card form sections" key={JSON.stringify(v)}>
      <fieldset>
        <legend>Overall, how was your experience with us? *</legend>
        <Scale name="overall" low="very poor" high="excellent" picked={v.overall} />
      </fieldset>
      <fieldset>
        <legend>
          How was your counsellor{counsellorName ? `, ${counsellorName}` : ""}?<span className="opt">optional</span>
        </legend>
        <Scale name="counsellorRating" low="very poor" high="excellent" picked={v.counsellorRating} />
      </fieldset>
      <fieldset>
        <legend>Did the sessions help you? *</legend>
        <Choices name="helped" options={HELPED} picked={v.helped} />
      </fieldset>
      <fieldset>
        <legend>Would you recommend us to a colleague? *</legend>
        <Choices name="recommend" options={RECOMMEND} picked={v.recommend} />
      </fieldset>
      <div className="field">
        <label htmlFor="comments">
          Anything else you&apos;d like to tell us?<span className="opt">optional</span>
        </label>
        <textarea
          id="comments"
          name="comments"
          maxLength={3000}
          defaultValue={v.comments}
          placeholder="What helped, what could be better. Please don't include your name if you want to stay anonymous."
        />
      </div>
      {state.error && <p className="err" id="feedback-err" role="alert">{state.error}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Sending…" : "Send feedback"}</button>
      </div>
    </form>
  );
}
