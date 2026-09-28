// Prague Integration's informed consent form, signed online before the first session. Any change to the
// wording must get a new version, so each signed form records exactly what the client agreed to.

export const CONSENT_VERSION = "2026-09 v1";

export type ConsentSection = { heading: string; paragraphs?: string[]; bullets?: string[] };

export const CONSENT_TITLE = "Informed Consent Form";

export const CONSENT_SECTIONS: ConsentSection[] = [
  {
    heading: "General Information",
    paragraphs: [
      "Prague Integration (PI), based in Prague, Czech Republic, is an independent company offering support services through professionally trained associate facilitators — psychologists, therapists, and counselors.",
      "Our facilitators aim to treat every client with respect and care, and to build an environment of safety and security in which each person can meaningfully engage with their particular concerns, whether individually or in a group setting.",
      "The success of any group also depends on each participant's commitment to creating and maintaining a warm, respectful community atmosphere.",
      "By signing this form, you (the client) agree to:",
    ],
    bullets: [
      "Do your best to attend all sessions on time and stay for the full session, and give your facilitator at least 48 hours' notice if you cannot attend.",
      "Attend sessions sober and free of any drugs or alcohol, including online sessions.",
      "Help create a comfortable atmosphere for all participants: keep confidential anything shared by other participants, speak only for yourself, refrain from judgment of other group members, share time and space fairly, and not discuss group matters outside of sessions — even with other members. You will be invited to share structured, constructive feedback.",
      "Actively participate in the process, understanding that progress depends on your own effort, may happen gradually, and cannot be guaranteed.",
      "Understand that counseling or therapy is a deeply personal process that may bring up uncomfortable or painful emotions, thoughts, memories, or physical responses. You take part at your own discretion and accept responsibility for your involvement.",
    ],
  },
  {
    heading: "For online sessions, facilitators and participants further agree to:",
    bullets: [
      "Ensure a quiet, private, and ideally uninterrupted space.",
      "Keep cameras on for the duration of the session.",
      "Not record any part of the session.",
      "Be fully present — phones and other devices set aside, with no other activity taking place during the session.",
    ],
  },
  {
    heading: "Session Formats",
    bullets: [
      "Group sessions: weekly, 90 minutes. Up to 10 participants with one facilitator, or up to 17 with two facilitators.",
      "Individual sessions: typically weekly, 50 minutes, or by agreement based on the client's goals.",
      "Coaching sessions: weekly, 60–90 minutes.",
      "Couples sessions: weekly, 60 minutes, occasionally extended to 80 minutes by agreement.",
    ],
  },
  {
    heading: "Cancellation Policy",
    bullets: [
      "Please arrive on time. If running late, message your practitioner in advance — sessions end at the scheduled time regardless.",
      "Support group sessions are prepaid; regular attendance is expected and fees are non-refundable in the event of absence.",
      "If you withdraw from a support group before the third session, PI will refund the remaining session fees. After the third session, no refund is issued.",
      "Individual sessions: cancellations must be made at least 48 hours in advance, or the full session fee applies (exceptions considered case-by-case for serious illness or circumstances beyond your control).",
      "Group sessions: cancellation policy is 24 hours.",
      "If your practitioner cancels an individual session with less than 48 hours' notice, you will be offered a complimentary session.",
    ],
  },
  {
    heading: "Fees",
    paragraphs: [
      "Rates vary by service type. If you have any questions about your fees, please contact us at contact@pragueintegration.cz.",
    ],
  },
  {
    heading: "Confidentiality",
    paragraphs: [
      "Czech law protects the confidentiality of all communication between client and practitioner. No information about you will be released without your signed permission — except where a practitioner has strong reason to believe a client intends to harm themselves or another person, in which case they are required to notify the police and may alert relevant parties, including a potential victim, appropriate institutions, or the client's family.",
      "PI practitioners may take part in regular supervision or peer consultation to support their clinical work. In these discussions, all identifying information is kept anonymous and confidential.",
      "Under GDPR, we confirm that your information will only be used to provide the treatment and care you have requested. In rare cases, this may involve sharing information with service providers such as insurers based outside the EU, who are not subject to EU GDPR regulations.",
      "If you are a parent or guardian seeking counseling for a child under 18, please discuss and agree on a disclosure protocol individually with your counselor.",
    ],
  },
  {
    heading: "Clinical Testing & Assessments",
    paragraphs: [
      "As part of counseling, therapy, coaching, or group participation, you may be invited to complete psychological questionnaires or clinical assessments to support your therapeutic work, monitor progress, or inform recommendations.",
      "All assessment results are treated as confidential clinical information, held to the same standards as other therapeutic communication. Specifically, they will:",
    ],
    bullets: [
      "Be used solely for therapeutic, counseling, or assessment purposes within Prague Integration.",
      "Not be shared with any third party without your written consent, except where disclosure is legally required (e.g. risk of harm to self or others).",
      "Be stored securely in accordance with GDPR and applicable Czech and EU data protection law.",
      "Only be discussed in supervision or peer consultation in anonymized form.",
    ],
  },
  {
    heading: "",
    paragraphs: [
      "Where assessments are conducted online, reasonable measures are taken to ensure secure transmission and storage — though no electronic system can guarantee absolute security.",
      "You have the right to request clarification of your results, and to request access to your testing records in accordance with applicable data protection law.",
    ],
  },
  {
    heading: "Agreement & Signature",
    paragraphs: [
      "Your signature below confirms that you have read and understood this informed consent form and agree to its terms. It also confirms your understanding that Prague Integration does not accept responsibility for any claims of damages arising, directly or indirectly, from services provided, and that you agree to pay all fees related to services received.",
      "If the client is under 18, a parent or guardian must sign on their behalf.",
    ],
  },
];

/** The whole text as one string, for recording a fingerprint of exactly what was signed. */
export const consentPlainText = () =>
  [CONSENT_TITLE, ...CONSENT_SECTIONS.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])])]
    .filter(Boolean)
    .join("\n");
