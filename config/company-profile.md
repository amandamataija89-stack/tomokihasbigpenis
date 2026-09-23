# Company Profile & Proposal Inputs

The `marketer` agent uses this file as its only source of truth about your
company — it will not invent claims, credentials, or services that aren't
listed here. Fields marked **(from web search)** were pulled from public
sources about pragueintegration.cz (the site itself is blocked by this
environment's network policy, so this could be incomplete or stale —
please correct anything wrong). Fields marked **NEEDS YOU** can't be found
publicly and must be filled in before the first batch can go out.

## Company

- **Legal name:** Prague Integration s.r.o.
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
  coaching, support groups (e.g. anxiety/depression support groups,
  ADHD support groups — mention this alongside individual therapy since
  it's a distinct, relevant referral option), and ADHD testing/diagnostic
  assessment (CONFIRMED by Amanda Mataija, 2026-09-21 — a distinct
  referral angle for peer psychologists/psychotherapists specifically,
  since testing/assessment is a service some solo practitioners don't
  offer in-house and may want to refer out for)
- Also offered but out of scope for this campaign: workplace wellbeing
  programs, Employee Assistance Programs (EAP), tailor-made corporate
  workshops, named corporate programs (Mental Health First Aid, Burnout
  Prevention, Neurodiversity in the Workplace, Men's Mental Health &
  Emotional Wellbeing, Stress Management & Resilience Training)
- Audience served: expats and locals in Prague

## Sender / point of contact

- **Name:** Amanda Mataija
- **Role/title:** CEO
- **Email (must match RESEND_FROM_EMAIL in config/resend.env):**
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

**Office/room photos** — found, confirmed (user verified), and now usable:
`assets/photos/office-individual-room.jpg` is the real individual
counselling room from your Jan 2026 photoshoot, downloaded from Google
Drive. Gmail's draft/send tools turned out to silently strip every
`<img>` tag from the email body no matter how it's referenced (cid:,
data:, and a plain https:// URL were all tried and all failed) — that's
the reason this project switched sending from Gmail to Resend. Resend
sends the HTML as given, so this photo can be embedded as a
`data:image/jpeg;base64,...` URI in `body.html` via the template's
PHOTO_BLOCK (see `marketer.md` Part 2). Two more photos from the same
shoot (a team photo, and a
group/support-group room) were identified in Drive but not yet pulled in
due to a flaky connection on large downloads — Drive file IDs
`1HVzRaw45D9eLHW95YsoWh-48svMRXPt-` (`K56A7929.JPG`) and
`1BwWrHpQjKP5pxZ6kHCuakHbHF1fWTT05` (`2 (4).jpg`) — retry those and save
into `assets/photos/` with a descriptive
name.

## What you're proposing to GPs, clinics, doctors, and other relevant
professionals

- **Service/program name:** Individual client referral partnership with
  Prague Integration
- **The ask (confirmed):** A referral partnership focused on individuals —
  when the recipient has a patient/client who needs mental health support
  (therapy/counseling), they refer them to Prague Integration. Not a
  corporate/workplace-program pitch.
- **How a referral works:** The referring GP/clinic sends the patient a
  registration link. The patient registers via that link, and Prague
  Integration gets back to them within 24 hours. No paperwork or
  follow-up required from the referring clinician beyond sharing the
  link.
- **Insurance / cost:** Prague Integration is a private practice, but
  works with a few insurance providers — clients can request a claim
  invoice to submit for reimbursement.
- **Languages:** Bilingual — Czech and English (useful to mention for
  expat/international patients).
- **Why a recipient would want this:** fast response (24-hour turnaround
  after registration), bilingual care (Czech + English), a simple
  one-link referral with no admin burden on the clinician, and insurance
  reimbursement is possible for some patients.
- **Evidence/credentials to cite** (licenses, clinical backing,
  partnerships, outcomes data — only real, verifiable claims): NEEDS YOU —
  optional; the 30+ psychologist team size (from the website) can be
  cited, but anything more specific (license numbers, named
  partnerships, outcome stats) needs to come from you.
- **Pricing or cost to the recipient (the referring clinician):** none —
  it's free for them to refer; cost/insurance details above apply to the
  patient, not the referrer.
- **Referral link URL:** https://pragueintegration.cz/individual-counselling/

## Student pricing (ISIC) — for university outreach specifically

- **CONFIRMED by Amanda Mataija (2026-09-21):** Prague Integration offers
  discounted pricing for students who present a valid ISIC (International
  Student Identity Card). This is a distinct offer for a distinct
  audience (university student services / international offices) from
  the GP/clinic individual-referral campaign above — don't mix the two
  pitches. Exact discount percentage/amount NEEDS YOU if a specific
  figure should be quoted; otherwise keep the claim general ("discounted
  pricing for ISIC holders") rather than inventing a number.

## International schools outreach — scope note

- **CONFIRMED by Amanda Mataija (2026-09-23):** For outreach to international
  schools (student support / counselling offices), Prague Integration should
  be pitched as a referral resource for **parents/families**, not for
  students/children directly — there is no confirmed pediatric/adolescent
  therapy specialty on file, so do not claim one. The school's student
  support office would refer expat parents/families (relocation stress,
  parenting, couples/family issues) to Prague Integration, not the student
  themselves.

## Language & tone

- **Primary language for emails:** Czech (recipients are Czech GPs/clinics)
  — the body should mention Prague Integration serves patients in both
  Czech and English, since that's a relevant selling point for referring
  expat patients, but the email itself is written in Czech. Tell me if you
  want a separate English version too.
- **Formality:** formal (vykání) is the default and expected norm for
  professional Czech correspondence unless you say otherwise
- **Format:** plain-text-first, newsletter-style HTML with your logo and
  brand color in the header/footer — no PDF brochure or heavy design
- **Length target:** short (120–180 words) is recommended for cold B2B
  outreach

## Legal basis for contacting recipients (editor agent will check this)

- **Basis for contact:** CONFIRMED by Amanda Mataija (2026-09-18):
  "legitimate interest — publicly listed professional contact, relevant
  to their practice."
- **Opt-out/unsubscribe instructions to include in every email** (drafted
  standard wording — edit freely):
  > Pokud si nepřejete od nás dále dostávat podobné e-maily, odpovězte
  > prosím na tento e-mail se slovem „ODHLÁSIT" a vyřadíme Vás ze seznamu
  > kontaktů. / If you'd prefer not to receive further emails like this,
  > reply with "UNSUBSCRIBE" and we'll remove you from our contact list.
- **Data retention period for collected contact data:** 12 months from the
  date of collection/last contact, or immediately upon an opt-out/objection
  request, whichever is earlier. (This is a standard, defensible cap for
  B2B legitimate-interest marketing data — re-verify/refresh the contact
  list if a campaign resumes after that window rather than reusing stale
  data.)
- **Who to contact with a data subject request (DPO/contact):**
  contact@pragueintegration.cz (Amanda Mataija) — update this if you want
  a dedicated privacy/DPO contact instead.

## Sending limits

- **Max emails to send per batch/day:** 20–30/day
- **Follow-up cadence:** one follow-up after 7 days, then stop (default —
  tell me if you want something different)
