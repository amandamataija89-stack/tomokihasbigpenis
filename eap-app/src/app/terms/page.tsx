import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service – Prague Integration" };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms apply when you ask {COMPANY.name}, {COMPANY.address}, IČO {COMPANY.ico} (&quot;we&quot;) for
        support through this website and when we work with you, whether through your employer&apos;s Employee
        Assistance Programme (EAP) or as a private client.
      </p>

      <h2>1. Our services</h2>
      <p>
        We provide psychological counselling, coaching and related services (such as ADHD testing), online or in
        person in Prague, in several languages. Our services are not a replacement for medical or psychiatric
        treatment where that is needed.
      </p>
      <p className="notice">
        <b>We are not an emergency service.</b> If you or someone else is in danger, call <b>112</b>, or the Linka
        první psychické pomoci on <b>116 123</b> (free, 24/7).
      </p>

      <h2>2. Asking for support</h2>
      <ul>
        <li>You send a request with the form. By sending it you confirm that the details are true and that you are 18 or over. Support for children and teenagers is arranged by a parent or legal guardian, who signs on the child&apos;s behalf.</li>
        <li>Before your first full session you sign our <b>informed consent form</b> online (we email you the link). It includes an emergency contact and the rules for sessions.</li>
        <li>We aim to contact you within 24 working hours (Monday to Friday), and as soon as possible if you tell us it&apos;s urgent.</li>
        <li>Our agreement to work together starts when we confirm your first session.</li>
      </ul>

      <h2>3. Session formats</h2>
      <ul>
        <li>Individual sessions: typically weekly, 50 minutes, or as agreed.</li>
        <li>Couples sessions: weekly, 60 minutes, occasionally 80 minutes by agreement.</li>
        <li>Coaching sessions: weekly, 60–90 minutes.</li>
        <li>Group sessions: weekly, 90 minutes; up to 10 participants with one facilitator, or up to 17 with two.</li>
        <li>Please attend sober and on time; sessions end at the scheduled time. For online sessions: a quiet, private space, camera on, no recording, and no other activity.</li>
      </ul>

      <h2>4. EAP clients</h2>
      <ul>
        <li>Your employer pays for up to 5 sessions per person under their programme. If you would like more, we can continue as a private client on the terms below.</li>
        <li>Your employer is never told who uses the programme or what you talk about; they only receive anonymous numbers of requests.</li>
        <li>The programme is available while your employer&apos;s agreement with us is active.</li>
      </ul>

      <h2>5. Private clients: prices and payment</h2>
      <ul>
        <li>The price per session is agreed with your counsellor from our current price list, and is shown before your sessions are booked. Prices are in CZK and VAT (currently 21 %) is added.</li>
        <li>We invoice monthly for the sessions of the previous month (or when agreed, e.g. for a prepaid package). Invoices are sent by email and are also available on your private page.</li>
        <li>Invoices are due within 14 days, by bank transfer with your variable symbol (the QR code on the invoice fills this in). If a payment is late, we&apos;ll send a reminder; we may pause booking new sessions until overdue invoices are paid.</li>
        <li>Prepaid packages are used for sessions in the order they&apos;re booked.</li>
      </ul>

      <h2>6. Cancelling or moving a session</h2>
      <ul>
        <li>Individual, couples and coaching sessions: please tell us at least <b>48 hours</b> before if you need to cancel or move it – by message on your private page, by email or by phone. We send a reminder 48 hours before each session.</li>
        <li>A session cancelled with less notice, or missed, counts as a session held: for EAP clients it is one of your 5 sessions, and private clients are charged the full session fee. We consider exceptions case by case for serious illness or circumstances beyond your control.</li>
        <li>Group sessions: 24 hours&apos; notice. Group sessions are prepaid and not refunded for absence; if you withdraw before the third session, we refund the remaining sessions.</li>
        <li>If your practitioner cancels an individual session with less than 48 hours&apos; notice, you&apos;ll be offered a complimentary session.</li>
      </ul>

      <h2>7. Confidentiality</h2>
      <p>
        What you share with us is confidential. We may only break confidentiality where the law requires it, or
        where there is a serious risk to your life or someone else&apos;s. We explain how we handle your data in our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>8. Your private page and links</h2>
      <p>
        We send you a private link to your messages and invoices. Anyone with the link can open it, so please keep
        it to yourself and don&apos;t forward our emails. Tell us if you think someone else has your link.
      </p>

      <h2>9. Your responsibilities</h2>
      <p>
        Please give us accurate contact and invoice details, attend sessions on time, and treat our staff with
        respect. We may end our work together if these terms are seriously broken, after telling you why.
      </p>

      <h2>10. Liability</h2>
      <p>
        We provide our services with professional care. We are not liable for outcomes that depend on factors outside
        our control, or for decisions you make yourself. Nothing in these terms limits liability that can&apos;t be
        limited by law, or your rights as a consumer.
      </p>

      <h2>11. Complaints and disputes</h2>
      <p>
        If you&apos;re not happy with something, please tell us at <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>;
        we&apos;ll reply within 30 days. If you are a consumer and we can&apos;t resolve it, you can use out-of-court
        dispute resolution with the Czech Trade Inspection Authority (Česká obchodní inspekce,{" "}
        <a href="https://adr.coi.gov.cz" rel="noopener">adr.coi.gov.cz</a>). These terms are governed by Czech law.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update these terms. The version that applies is the one in force when you book a session; we&apos;ll
        tell clients we&apos;re working with about important changes in advance.
      </p>
    </LegalPage>
  );
}
