---
name: prague-gp-outreach
description: Run the mental-health-to-GP outreach workflow — research Prague GPs, draft personalized partnership proposal emails, run a compliance check, and prepare a batch for the user's approval before anything sends. Use when the user asks to find GPs, draft proposals, run the GP outreach campaign, or continue/expand an existing batch.
---

# Prague GP mental-health outreach

This skill coordinates four agents to run one batch of a B2B outreach
campaign: a mental-health company proposing a partnership/referral
relationship to general practitioners (GPs) in Prague. It never sends
email on its own judgment — every batch stops for explicit user approval
before `email-sender` is allowed to run.

## Before the first run

Check `config/company-profile.md`. If any of these fields are still blank
placeholders, stop and ask the user to fill them in first — do not invent
company details, pricing, or claims to fill gaps:

- Company/sender identity and contact email
- What's being proposed and the ask
- Legal basis for contact + opt-out text + retention/DSR contact
- Max emails per batch/day

Also check `config/resend.env` exists (copied from
`config/resend.env.example` and filled in with a real Resend API key and a
sending domain the user has verified in Resend). If it's missing, you can
still run steps 1–4 (research/draft/compliance/review), but tell the user
this needs to be done before step 5 can actually send anything.

## Workflow

1. **Research** — invoke the `gp-researcher` subagent to build or extend
   `data/gp-contacts.csv`. Skip this step if the user says the list is
   already sufficient for this batch.
2. **Draft** — invoke the `proposal-drafter` subagent to turn unsent
   contacts into a batch: one `.txt` file per email under
   `data/drafts/<date>/` (the authoritative content) plus, best-effort, a
   matching Gmail draft for easy inline review, logged in
   `data/draft-batch-<date>.csv`. Respect the batch size limit in the
   company profile.
3. **Compliance check** — invoke the `compliance-reviewer` subagent on that
   batch. If it returns FIX REQUIRED, surface the exact fixes to the user
   and stop — do not proceed to review/send until it's resolved (either by
   fixing the profile/drafts, or the user explicitly overriding a specific
   non-blocking flag).
4. **Present the batch for approval** — summarize to the user: how many
   drafts, recipients (name + clinic), and the compliance verdict. Show 1–2
   full example drafts so they can sanity-check tone/content, and point to
   the Gmail drafts folder (or the `.txt` files) for the rest. Wait for
   explicit approval — do not send anything on your own judgment call.
5. **Send** — only after the user explicitly approves the batch, invoke the
   `email-sender` subagent, telling it plainly that this specific batch
   file has been approved. It dry-runs, then sends via Resend, and updates
   `data/draft-batch-<date>.csv` status column as each one sends. If
   anything fails to send, report which ones and why rather than silently
   retrying.

## Re-running / expanding

If the user asks to "send more" or "expand the list", re-run from step 1
scoped to new contacts only — `gp-researcher` already dedupes against the
existing CSV, and `proposal-drafter` should skip GPs who already have a
draft or a sent email logged in a previous `draft-batch-*.csv`.

## Hard rules (do not relax these even if asked to move faster)

- Never send without an explicit per-batch approval from the user.
- Never fabricate GP contacts, emails, or company claims.
- Never skip the compliance check to save time.
- Never exceed the batch/day limit set in `config/company-profile.md`.
