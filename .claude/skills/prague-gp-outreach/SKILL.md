---
name: prague-gp-outreach
description: Run the Prague Integration mental-health outreach workflow — a marketer agent researches Prague GPs/clinics/doctors/relevant contacts and drafts newsletter-style branded proposal emails (photos embedded where relevant), an editor agent reviews for quality and compliance, then the user approves before marketer sends via Resend. Use when the user asks to find contacts, draft proposals, run the outreach campaign, or continue/expand an existing batch.
---

# Prague Integration mental-health outreach

This skill coordinates a two-agent team — `marketer` and `editor` — to run
one batch of a B2B outreach campaign for Prague Integration, proposing a
referral partnership to GPs, clinics, doctors, and other relevant
professionals in Prague. It never sends email on its own judgment — every
batch stops for explicit user approval before `marketer` is allowed to
run the actual send.

Sending goes through Resend (not Gmail) — this was switched deliberately:
Gmail's draft/send tools were tested and confirmed to strip every `<img>`
tag from the email body no matter how it's referenced, so photos couldn't
be embedded. Resend sends the HTML exactly as given, so a real photo in
the body actually renders.

## Before the first run

Check `config/company-profile.md`. Fields marked "NEEDS YOU" must be
filled in before drafting — do not invent company details, the specific
ask, pricing, or claims to fill gaps.

Also check `config/resend.env` exists (copied from
`config/resend.env.example`, filled in with a real API key and a verified
sending domain). Steps 1–3 below (research/draft/review) can run without
it, but tell the user it's needed before step 4 can actually send.

## Workflow

1. **Research + draft** — invoke `marketer` to build/extend
   `data/contacts.csv` (GPs, clinics, doctors, other relevant contacts —
   skip research if the user says the list is sufficient) and turn unsent
   contacts into a batch: for each recipient, `data/drafts/<date>/<slug>/
   body.txt` + `body.html` (newsletter-style, brand header, real photo
   embedded where one fits — see `marketer.md` Part 2), plus a best-effort
   (non-authoritative) Gmail draft for easy browsing, all logged in
   `data/draft-batch-<date>.csv`. Respect the batch size limit.
2. **Edit + compliance check** — invoke `editor` on that batch. If it
   returns FIX REQUIRED, surface the exact fixes to the user and stop — do
   not proceed until resolved (fix and re-draft, or the user explicitly
   overrides a specific non-blocking flag).
3. **Present the batch for approval** — summarize to the user: how many
   emails, recipients (name + organization), and editor's verdict. Show
   1–2 full example emails (both plain-text and how the HTML/newsletter
   version reads, photo included) so they can sanity-check tone/content/
   branding. **Wait for explicit approval before doing anything else —
   never send on your own judgment, and never send just because a batch
   passed the editor check.**
4. **Send** — only after the user has explicitly said to send this
   specific batch, invoke `marketer` again to send it. It dry-runs then
   sends via `scripts/send_via_resend.py`, updating
   `data/draft-batch-<date>.csv` status per row. Report failures rather
   than silently retrying.

## Re-running / expanding

If the user asks to "send more" or "expand the list", re-run from step 1
scoped to new contacts only — `marketer`'s research step dedupes against
`data/contacts.csv`, and drafting skips anyone who already has a draft or
a sent email logged in a previous `draft-batch-*.csv`.

## Hard rules (do not relax these even if asked to move faster)

- Never send without an explicit, per-batch "yes, send it" from the user
  AND a CLEAR TO SEND from `editor`. A completed draft batch is not by
  itself permission to send.
- Never fabricate contacts, emails, or company claims.
- Never skip the editor/compliance check to save time.
- Never exceed the batch/day limit set in `config/company-profile.md`.
