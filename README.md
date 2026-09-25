# Prague Integration Mental-Health Outreach

An AI agent team — `marketer` and `editor` — for researching Prague GPs,
clinics, doctors, and other relevant contacts, and sending them
newsletter-style branded proposal emails (real photos included) on behalf
of Prague Integration. Sending is a separate, explicit step, and only
ever runs after you've reviewed and approved the batch.

Sending goes through **Resend**, not Gmail: Gmail's draft/send tools
were tested and confirmed to silently strip every `<img>` tag from the
email body no matter how it's referenced, so photos couldn't be embedded.
Resend sends the HTML exactly as given.

## Setup

1. Fill in **`config/company-profile.md`**. `marketer` won't draft
   anything until the required fields are filled in — in particular the
   specific ask, sender identity, branding, and legal/compliance basics.
2. Set up Resend for actual sending:
   - Create a Resend account and a verified sending domain (Domains ->
     Add Domain -> add the SPF/DKIM/DMARC records it gives you to your
     DNS).
   - Create an API key at resend.com/api-keys.
   - Copy `config/resend.env.example` to `config/resend.env` and fill in
     your API key, from name/email, and reply-to address.
     `config/resend.env` is gitignored — it holds a real secret and must
     never be committed.

## Running it

Invoke the skill:

```
/prague-gp-outreach
```

This runs, in order:

1. **`marketer`** (research + draft) — finds Prague GPs/clinics/doctors/
   other relevant contacts (`data/contacts.csv`), then for each one writes
   a newsletter-style email (`data/drafts/<date>/<slug>/body.txt` +
   `body.html`, branded via `templates/email-newsletter.html`, with a real
   photo from `assets/photos/` embedded where relevant), plus a
   best-effort (non-authoritative) Gmail draft for easy browsing. Logged
   in `data/draft-batch-<date>.csv`. Nothing sends at this stage.
2. **`editor`** — reviews the batch for tone, brand consistency, and Czech
   e-marketing/GDPR compliance, writing `data/compliance-report-<date>.md`.
3. A summary is presented to you for approval — nothing sends until you
   explicitly say so.
4. **`marketer`** (send) — only once you've approved, dry-runs then sends
   via `scripts/send_via_resend.py`, updating
   `data/draft-batch-<date>.csv` status per row.

To expand an existing campaign ("find more contacts", "send another
batch"), just invoke the skill again — it dedupes against previous runs.

## Files

- `.claude/skills/prague-gp-outreach/SKILL.md` — the workflow orchestration
- `.claude/agents/marketer.md` — research, drafting, and sending
- `.claude/agents/editor.md` — quality + compliance review before sending
- `templates/email-newsletter.html` — the branded HTML template
  (logo/colors rebuilt in HTML/CSS; PHOTO_BLOCK for embedding a real
  photo as a data URI)
- `scripts/send_via_resend.py` — the actual Resend API call, run by
  `marketer`; safe to run manually too (`--dry-run` first)
- `config/company-profile.md` — your company/proposal/branding/compliance
  inputs
- `config/resend.env.example` — template for Resend credentials (copy to
  `config/resend.env`, which is gitignored)
- `assets/photos/` — real, resized photos available for use in emails
- `data/` — generated contact lists, drafts, and reports (gitignored —
  this is personal data and shouldn't live in git history)

## Employee Assistance Programme app

`eap-app/` is a separate web app where employees of client companies
register for confidential support and Prague Integration's team follows up.
See `eap-app/README.md`. `eap/company-application.html` is a standalone
form companies can fill in to apply for the programme.

## Note

`editor` runs a checklist, not a legal review. For an ongoing campaign at
this scale, it's worth having counsel confirm the "legitimate interest"
basis for contacting healthcare professionals in the Czech Republic once,
up front.
