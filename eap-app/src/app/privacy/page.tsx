import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy – Prague Integration" };

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains how {COMPANY.name} (&quot;we&quot;) handles your personal data when you ask us for
        support, whether through your employer&apos;s Employee Assistance Programme (EAP) or as a private client, and
        when you work with us. We take the confidentiality of what you share with us very seriously.
      </p>

      <h2>1. Who is responsible for your data</h2>
      <p>
        The controller is {COMPANY.name}, {COMPANY.address}, IČO {COMPANY.ico}, DIČ {COMPANY.dic}. For anything about
        your data, write to <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> or call {COMPANY.phone}.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li><b>Contact details:</b> the name you want us to use (a nickname is fine), your full name if you give it (required for private clients, for invoices), email, phone number, how you prefer to be contacted, and, for private clients, your residential address.</li>
        <li><b>Your request:</b> whether you need help urgently, what you would like support with and anything you write to us, the kind of support (e.g. individual or couple counselling), your age range, gender, where you are based, your language, and online or in person.</li>
        <li><b>Health-related information:</b> much of what you tell us about your wellbeing is a special category of personal data under the GDPR. We process it only with your explicit consent (see section 4).</li>
        <li><b>Our work together:</b> session dates, attendance and cancellations, notes written by our team, your counsellor&apos;s own session notes (which only your counsellor can read), and messages exchanged on your private page.</li>
        <li><b>For EAP clients:</b> which company&apos;s programme you came through (from the company code).</li>
        <li><b>Your signed informed consent form:</b> your name and surname, permanent home and local address, phone, email, an <b>emergency contact</b> (their name, relationship and phone or email – please tell them you&apos;ve named them), anything else relevant you choose to tell us, your signature, and when and from which internet address it was signed. If a parent or guardian signs for a minor, their name too.</li>
        <li><b>Your intake &amp; registration form</b> (private clients, before the free discovery session): your name, date of birth, gender, phone, email, country of origin, relationship status, whether you live in the Czech Republic, illnesses and medication, symptoms and how often you have them, family history, thoughts of harming yourself or others, previous help, addictions, what brings you to counselling and your questions, with your signature and when it was signed.</li>
        <li><b>Questionnaires and assessments</b> you complete as part of your sessions, and their results.</li>
        <li><b>For private clients – billing:</b> session prices, invoices, payments received (including the payer name, amount, date and variable symbol from our bank statement), and any invoice details you give us (e.g. a company name, IČO or DIČ).</li>
        <li><b>Consent records:</b> when you gave each consent.</li>
        <li><b>Feedback:</b> if you fill in our feedback form, your answers are stored anonymously – without your name, email or case – and only our management can read them.</li>
        <li><b>Technical data:</b> our hosting provider keeps short-lived server logs (such as IP addresses) for security and to keep the service running.</li>
      </ul>

      <h2>3. What we use it for</h2>
      <ul>
        <li>to contact you, arrange and provide counselling and related services, and remind you of sessions;</li>
        <li>to contact your emergency contact if we have strong reason to believe you or someone else is at serious risk;</li>
        <li>to assign you to a suitable counsellor (see section 8) and to coordinate your care within our team;</li>
        <li>for private clients: to invoice you (using the name, email and home address from your signed consent form), record payments and send payment reminders;</li>
        <li>for EAP clients: to report to your employer only the <b>number</b> of requests from their company – never who asked or why;</li>
        <li>to meet our legal obligations (e.g. accounting and tax) and to protect the security of the service;</li>
        <li>to improve our services, using anonymous feedback.</li>
      </ul>

      <h2>4. Legal basis</h2>
      <ul>
        <li><b>Your explicit consent</b> (GDPR Art. 6(1)(a) and 9(2)(a)) to store and share your request, including information about your wellbeing, with the counsellor and coordinator who handle it, and to contact you. You give it on the request form and can withdraw it at any time (see section 9); withdrawal doesn&apos;t affect what we did before.</li>
        <li><b>Performing our agreement with you</b> (Art. 6(1)(b)): arranging and providing sessions and, for private clients, billing.</li>
        <li><b>Legal obligations</b> (Art. 6(1)(c)): keeping invoices and accounting records as Czech tax and accounting law requires.</li>
        <li><b>Protecting life</b> (Art. 6(1)(d) and 9(2)(c)): in the rare case that someone&apos;s life or safety is at serious risk.</li>
        <li><b>Our legitimate interests</b> (Art. 6(1)(f)): keeping the service secure and handling complaints or legal claims.</li>
      </ul>

      <h2>5. Who can see your data</h2>
      <ul>
        <li><b>Within Prague Integration:</b> only the counsellor who works with you, our coordinator and our management. Other counsellors can&apos;t see your case. Your counsellor&apos;s own session notes can be read only by your counsellor. Counsellors may discuss their work in supervision or peer consultation, but only in anonymised form, without anything that identifies you.</li>
        <li><b>In an emergency:</b> where a practitioner has strong reason to believe you intend to harm yourself or someone else, they must notify the police and may alert others who need to know, such as a potential victim, appropriate institutions, or your emergency contact or family.</li>
        <li><b>Your employer (EAP):</b> never sees who uses the programme, what you talk about, or any of your data. We only report anonymous numbers of requests.</li>
        <li><b>Service providers</b> who process data for us under contract and our instructions: Vercel Inc. (hosting of this app), Neon Inc. (database, stored in Frankfurt, Germany), Resend Inc. (sending emails), and our bank (receiving payments). Emails we send you never contain what you wrote to us – only that there is a message, session details or an invoice.</li>
        <li><b>Authorities</b> when the law requires it (e.g. tax authorities for invoices).</li>
        <li><b>Others, only with your written permission</b> – for example an insurer you ask us to deal with, which may be outside the EU.</li>
      </ul>
      <p>
        Some of these providers are based in, or use servers in, countries outside the EU/EEA (such as the USA or
        Japan). Where this happens, the transfer is protected by an EU adequacy decision or by the EU Standard
        Contractual Clauses.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>Client records – your request, consent form, session records, notes, assessments and messages: while we work with you and then for <b>3 years after our last contact</b>, after which they are deleted automatically – unless you ask us to delete them sooner (see section 9).</li>
        <li>Invoices and payment records: <b>10 years</b> from the end of the year they were issued, as Czech tax law requires. After the 3 years above, we keep only what the invoices show (your name, invoice address, variable symbol and the session dates they cover).</li>
        <li>Your private messages page stops working 30 days after your sessions end.</li>
        <li>Anonymous feedback is kept without a time limit, as it can&apos;t be linked to you.</li>
      </ul>

      <h2>7. Security</h2>
      <p>
        Access to client data is limited to named staff with their own passwords. Connections are encrypted,
        passwords and one-use links are stored only in scrambled (hashed) form, and staff sign-ins expire after 12
        hours.
      </p>

      <h2>8. Automatic assignment</h2>
      <p>
        When you send an EAP request, the app offers it to an available counsellor automatically, based on your
        language and how many new clients each counsellor has this month. A person always decides whether to take
        you on, and you can ask for a different counsellor at any time. No decision with legal or similarly
        significant effects is made about you by automated means alone.
      </p>

      <h2>9. Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>access your data and get a copy of it;</li>
        <li>have it corrected if it&apos;s wrong;</li>
        <li>have it deleted, or its use restricted (except where the law requires us to keep it, e.g. invoices);</li>
        <li>receive the data you gave us in a common format (data portability);</li>
        <li>object to processing based on our legitimate interests;</li>
        <li>withdraw your consent at any time.</li>
      </ul>
      <p>
        To use any of these rights, write to <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. We&apos;ll reply
        within one month. You can also complain to the Czech data protection authority, Úřad pro ochranu osobních
        údajů, Pplk. Sochora 27, 170 00 Praha 7, <a href="https://uoou.gov.cz" rel="noopener">uoou.gov.cz</a>.
      </p>

      <h2>10. Children</h2>
      <p>
        Our services are for adults (18 and over). Support for children and teenagers is arranged with a parent or
        legal guardian, who signs the consent form on the child&apos;s behalf and agrees a disclosure protocol with the
        counsellor.
      </p>

      <h2>11. Cookies</h2>
      <p>
        We use no advertising or tracking cookies. See our <Link href="/cookies">Cookie Policy</Link>.
      </p>

      <h2>12. Our status</h2>
      <p>
        Prague Integration is not a healthcare provider under the Czech Act on Health Services; our counselling,
        therapy and coaching are not provided as health services.
      </p>

      <h2>13. Changes</h2>
      <p>
        We may update this policy. The date at the top shows the latest version; if we make important changes we
        will tell clients we are working with.
      </p>
    </LegalPage>
  );
}
