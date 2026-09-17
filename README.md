# Prague Integration Mental-Health Outreach

An AI agent team — `marketer` and `editor` — for researching Prague GPs,
clinics, doctors, and other relevant contacts, and sending them
newsletter-style branded proposal emails on behalf of Prague Integration.
Sending is a separate, explicit step gated by an editor review and your
approval.

## Setup

1. Fill in **`config/company-profile.md`**. It's pre-filled with public
   info about Prague Integration found via web search (the site itself is
   blocked by this environment's network policy, so double-check it), but
   several fields are marked "NEEDS YOU" — in particular the *specific ask*
   for this campaign, your logo URL/brand color, and legal/compliance
   basics. `marketer` won't draft anything until these are filled in.
2. Make sure the Gmail connection this session uses is the account you
   want draft copies to show up in (optional — used only for easy inline
   review, not for sending).
3. Set up Resend for actual sending:
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
   other relevant contacts (`data/contacts.csv`), then writes each
   proposal as a newsletter-style email: `data/drafts/<date>/<slug>/body.txt`
   (plain text, authoritative) and `body.html` (branded HTML version with
   your logo/color), best-effort mirrored as a Gmail draft. Logged in
   `data/draft-batch-<date>.csv`. Never sends at this stage.
2. **`editor`** — reviews the batch for tone, brand consistency, and Czech
   e-marketing/GDPR compliance, writing `data/compliance-report-<date>.md`.
3. A summary is presented to you for approval — nothing sends until you
   say so explicitly.
4. **`marketer`** (send) — only once you've approved, dry-runs then sends
   the batch via the Resend API, updating each row's status in
   `data/draft-batch-<date>.csv`.

To expand an existing campaign ("find more contacts", "send another
batch"), just invoke the skill again — it dedupes against previous runs.

## Files

- `.claude/skills/prague-gp-outreach/SKILL.md` — the workflow orchestration
- `.claude/agents/marketer.md` — research, drafting, and sending
- `.claude/agents/editor.md` — quality + compliance review before sending
- `scripts/send_via_resend.py` — the actual Resend API call, run by
  `marketer`; safe to run manually too (`--dry-run` first)
- `config/company-profile.md` — your company/proposal/branding/compliance
  inputs
- `config/resend.env.example` — template for Resend credentials (copy to
  `config/resend.env`, which is gitignored)
- `data/` — generated contact lists, drafts, and reports (gitignored —
  this is personal data and shouldn't live in git history)

## Note

`editor` runs a checklist, not a legal review. For an ongoing campaign at
this scale, it's worth having counsel confirm the "legitimate interest"
basis for contacting healthcare professionals in the Czech Republic once,
up front.
