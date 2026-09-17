# Company Profile & Proposal Inputs

The `marketer` agent uses this file as its only source of truth about your
company — it will not invent claims, credentials, or services that aren't
listed here. Fields marked **(from web search)** were pulled from public
sources about pragueintegration.cz (the site itself is blocked by this
environment's network policy, so this could be incomplete or stale —
please correct anything wrong). Fields marked **NEEDS YOU** can't be found
publicly and must be filled in before the first batch can go out.

## Company

- **Legal name:** NEEDS YOU (full registered legal entity name incl. legal
  form, e.g. "... s.r.o." — IČO and registered seat are confirmed below,
  just need the exact legal name as it appears in the Czech commercial
  register)
- **Trading/brand name:** Prague Integration
- **Website:** https://www.pragueintegration.cz
- **Registered seat (Czech Republic):** Olšanská 4E, 130 00 Prague, CZ
- **Office / correspondence address:** Mezibranská 4, 110 00 Prague,
  Prague 1
- **Company registration / IČO:** 21048428
- **Phone:** +420 608 573 256

## What Prague Integration does *(from web search — please correct/expand)*

**For this campaign, the focus is individual clients — referring GPs/
clinics to send individual patients for therapy/counseling, not corporate/
workplace programs.** Corporate services exist (EAP, workshops, etc.) but
`marketer` should not lead with them in this campaign's emails unless the
user says otherwise; keep them out of the draft content.

- International team of 30+ psychologists, counsellors, trainers, business
  coaches and advisors
- Delivery: online, in-person, onsite, and hybrid
- Languages: English, Czech, Russian, Spanish, and more
- Individual services (campaign focus): individual therapy, counseling,
  coaching
- Also offered but out of scope for this campaign: workplace wellbeing
  programs, Employee Assistance Programs (EAP), tailor-made corporate
  workshops, named corporate programs (Mental Health First Aid, Burnout
  Prevention, Neurodiversity in the Workplace, Men's Mental Health &
  Emotional Wellbeing, Stress Management & Resilience Training)
- Audience served: expats and locals in Prague

## Sender / point of contact

- **Name:** Amanda Mataija
- **Role/title:** CEO
- **Email (must match the RESEND_FROM_EMAIL in config/resend.env):**
  contact@pragueintegration.cz
- **Phone:** +420 608 573 256

## Branding (for the newsletter-style email template)

- **Logo image:** No hosted URL yet. You shared the logo as an image in
  chat, but this session has no file-upload path to save it from — there's
  nothing on disk to host. `templates/email-newsletter.html` instead
  rebuilds the mark in HTML/CSS (bold "Prague" + two rose dots, green "+"
  + "Integration" + two navy triangles), which also has the benefit of
  rendering even in clients that block remote images by default. If you
  get me a public URL to the real logo file later, swap the header block
  in the template for an `<img>` tag.
- **Colors (approximated from the logo you shared — please confirm/correct
  exact hex codes if you have brand guidelines):**
  - Text/black: `#0a0a0a`
  - Accent green (the "+"): `#4e9c77`
  - Accent rose (the dots): `#d98aa0`
  - Accent navy (the triangles): `#33416b`
- **Font preference, if any (otherwise a clean system font is used):**

## What you're proposing to GPs, clinics, doctors, and other relevant
professionals

- **Service/program name:** Individual client referral partnership with
  Prague Integration
- **The ask (confirmed):** A referral partnership focused on individuals —
  when the recipient has a patient/client who needs mental health support
  (therapy/counseling), they refer them to Prague Integration. Not a
  corporate/workplace-program pitch.
- **One-paragraph description (what it is, who it's for):** NEEDS YOU —
  e.g. what happens after a referral (how do they refer someone — a form,
  a phone number, an email? what's the intake process? is there a
  dedicated contact for referring clinicians?), and which of your
  services/languages/formats (see list above) are most relevant to
  mention for a referral context.
- **Why a recipient would want this** (patient benefit, faster access to
  care, multilingual coverage, no cost/admin burden to them, etc.):
  NEEDS YOU
- **Evidence/credentials to cite** (licenses, clinical backing,
  partnerships, outcomes data — only real, verifiable claims): NEEDS YOU
- **Pricing or cost to the recipient, if any:** presumably free to refer
  (confirm) — NEEDS YOU to confirm whether there's any cost/commitment on
  the referring clinician's side

## Language & tone

- **Primary language for emails:** Czech / English / bilingual — NEEDS YOU
  (the site itself appears to serve an international/expat audience, so
  bilingual may make sense, but confirm)
- **Formality:** formal (vykání) is the default and expected norm for
  professional Czech correspondence unless you say otherwise
- **Format:** plain-text-first, newsletter-style HTML with your logo and
  brand color in the header/footer — no PDF brochure or heavy design
- **Length target:** short (120–180 words) is recommended for cold B2B
  outreach

## Legal basis for contacting recipients (editor agent will check this)

- **Basis for contact:** e.g. "legitimate interest — publicly listed
  professional contact, relevant to their practice" (see
  `.claude/agents/editor.md` for the checklist this must satisfy)
- **Opt-out/unsubscribe instructions to include in every email:** NEEDS YOU
  (or say "use standard wording" and I'll draft it)
- **Data retention period for collected contact data:** NEEDS YOU
- **Who to contact with a data subject request (DPO/contact):** NEEDS YOU

## Sending limits

- **Max emails to send per batch/day (recommended: start low, e.g. 20–30/day,
  to protect sender reputation and allow manageable follow-up):** NEEDS YOU
- **Follow-up cadence (e.g. one follow-up after 7 days, then stop):** NEEDS
  YOU
