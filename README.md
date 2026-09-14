# Prague GP Mental-Health Outreach

An AI agent team (Claude Code skill + subagents) for researching Prague GPs
and drafting personalized partnership proposals from your mental-health
company — with a compliance check and an explicit approval step before
anything sends.

## Setup

1. Fill in **`config/company-profile.md`** — real company info, the
   proposal content, and your GDPR/opt-out basics. The drafting agent will
   refuse to invent anything not in this file.
2. Make sure the Gmail connection this session uses is the account you
   want proposals to be sent from.

## Running it

Invoke the skill:

```
/prague-gp-outreach
```

This runs, in order:

1. **`gp-researcher`** — finds Prague GPs from public sources and writes
   `data/gp-contacts.csv`.
2. **`proposal-drafter`** — turns contacts into personalized Gmail drafts
   (never sends), logged in `data/draft-batch-<date>.csv`.
3. **`compliance-reviewer`** — checks the batch against Czech e-marketing
   law and GDPR basics, writing `data/compliance-report-<date>.md`.
4. A summary is presented to you for approval. Nothing sends until you say
   so explicitly.

To expand an existing campaign ("find more GPs", "send another batch"),
just invoke the skill again — it dedupes against previous runs.

## Files

- `.claude/skills/prague-gp-outreach/SKILL.md` — the workflow orchestration
- `.claude/agents/gp-researcher.md` — research subagent
- `.claude/agents/proposal-drafter.md` — drafting subagent
- `.claude/agents/compliance-reviewer.md` — compliance-check subagent
- `config/company-profile.md` — your company/proposal/compliance inputs
- `data/` — generated contact lists, drafts, and reports (gitignored —
  this is personal data and shouldn't live in git history)

## Note

The compliance agent runs a checklist, not a legal review. For an ongoing
campaign at this scale, it's worth having counsel confirm the
"legitimate interest" basis for contacting healthcare professionals in the
Czech Republic once, up front.
