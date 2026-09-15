# Prague GP Mental-Health Outreach

An AI agent team (Claude Code skill + subagents) for researching Prague GPs
and drafting personalized partnership proposals from your mental-health
company — with a compliance check, an explicit approval step, and Resend
for the actual sending.

## Setup

1. Fill in **`config/company-profile.md`** — real company info, the
   proposal content, and your GDPR/opt-out basics. The drafting agent will
   refuse to invent anything not in this file.
2. Make sure the Gmail connection this session uses is the account you
   want draft copies to show up in (optional — used only for easy inline
   review, not for sending).
3. Set up Resend for actual sending:
   - Create a Resend account and a verified sending domain (Domains ->
     Add Domain -> add the SPF/DKIM/DMARC records it gives you to your
     DNS). Sending from an unverified domain fails or lands in spam.
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

1. **`gp-researcher`** — finds Prague GPs from public sources and writes
   `data/gp-contacts.csv`.
2. **`proposal-drafter`** — writes each personalized email to
   `data/drafts/<date>/*.txt` (the authoritative content) and, best-effort,
   a matching Gmail draft for easy review. Never sends. Logged in
   `data/draft-batch-<date>.csv`.
3. **`compliance-reviewer`** — checks the batch against Czech e-marketing
   law and GDPR basics, writing `data/compliance-report-<date>.md`.
4. A summary is presented to you for approval — nothing sends until you
   say so explicitly.
5. **`email-sender`** — only once you've approved, dry-runs then sends the
   batch via the Resend API, updating each row's status in
   `data/draft-batch-<date>.csv`.

To expand an existing campaign ("find more GPs", "send another batch"),
just invoke the skill again — it dedupes against previous runs.

## Files

- `.claude/skills/prague-gp-outreach/SKILL.md` — the workflow orchestration
- `.claude/agents/gp-researcher.md` — research subagent
- `.claude/agents/proposal-drafter.md` — drafting subagent
- `.claude/agents/compliance-reviewer.md` — compliance-check subagent
- `.claude/agents/email-sender.md` — sends approved batches via Resend
- `scripts/send_via_resend.py` — the actual Resend API call, run by
  `email-sender`; safe to run manually too (`--dry-run` first)
- `config/company-profile.md` — your company/proposal/compliance inputs
- `config/resend.env.example` — template for Resend credentials (copy to
  `config/resend.env`, which is gitignored)
- `data/` — generated contact lists, drafts, and reports (gitignored —
  this is personal data and shouldn't live in git history)

## Note

The compliance agent runs a checklist, not a legal review. For an ongoing
campaign at this scale, it's worth having counsel confirm the
"legitimate interest" basis for contacting healthcare professionals in the
Czech Republic once, up front.
