# Prague Integration Mental-Health Outreach

An AI agent team — `marketer` and `editor` — for researching Prague GPs,
clinics, doctors, and other relevant contacts, and sending them
newsletter-style branded proposal emails on behalf of Prague Integration.
Sending is a separate, explicit step: `marketer` only ever sends the exact
Gmail draft `editor` reviewed and you approved, never a freshly composed
message.

## Setup

1. Fill in **`config/company-profile.md`**. `marketer` won't draft
   anything until the required fields are filled in — in particular the
   specific ask, sender identity, branding, and legal/compliance basics.
2. That's it. Sending uses the Gmail account already connected to this
   session (`contact@pragueintegration.cz`) — no API keys or domain setup
   needed.

## Running it

Invoke the skill:

```
/prague-gp-outreach
```

This runs, in order:

1. **`marketer`** (research + draft) — finds Prague GPs/clinics/doctors/
   other relevant contacts (`data/contacts.csv`), then for each one writes
   a newsletter-style email (`data/drafts/<date>/<slug>/body.txt` +
   `body.html`, branded via `templates/email-newsletter.html`) and creates
   a real Gmail draft from that exact content. Logged in
   `data/draft-batch-<date>.csv`. Nothing sends at this stage.
2. **`editor`** — reviews the batch for tone, brand consistency, and Czech
   e-marketing/GDPR compliance, writing `data/compliance-report-<date>.md`.
3. A summary is presented to you for approval — nothing sends until you
   explicitly say so.
4. **`marketer`** (send) — only once you've approved, sends each row's
   existing Gmail draft by ID (so what sends is exactly what was
   reviewed), updating `data/draft-batch-<date>.csv` status per row.

To expand an existing campaign ("find more contacts", "send another
batch"), just invoke the skill again — it dedupes against previous runs.

## Files

- `.claude/skills/prague-gp-outreach/SKILL.md` — the workflow orchestration
- `.claude/agents/marketer.md` — research, drafting, and sending
- `.claude/agents/editor.md` — quality + compliance review before sending
- `templates/email-newsletter.html` — the branded HTML template
  (logo/colors rebuilt in HTML/CSS from the shared logo image)
- `config/company-profile.md` — your company/proposal/branding/compliance
  inputs
- `data/` — generated contact lists, drafts, and reports (gitignored —
  this is personal data and shouldn't live in git history)

## Note

`editor` runs a checklist, not a legal review. For an ongoing campaign at
this scale, it's worth having counsel confirm the "legitimate interest"
basis for contacting healthcare professionals in the Czech Republic once,
up front.
