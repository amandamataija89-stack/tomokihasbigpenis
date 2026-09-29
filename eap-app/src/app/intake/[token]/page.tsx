import type { Metadata } from "next";
import { Brand, SiteFooter } from "@/components/Brand";
import { pool } from "@/lib/db";
import { latestIntake } from "@/lib/intake";
import { conversationFor } from "@/lib/messages";
import { IntakeForm } from "./IntakeForm";

export const metadata: Metadata = { title: "Intake & registration – Prague Integration", robots: { index: false } };

// The client fills in the intake & registration form before their discovery session.
export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const convo = await conversationFor(token);
  if (!convo)
    return (
      <main className="wrap">
        <Brand />
        <section className="card stack">
          <h1 style={{ fontSize: 28 }}>This link no longer works</h1>
          <p>Please contact us on +420 608 573 256 or contact@pragueintegration.cz for a new one.</p>
        </section>
        <SiteFooter />
      </main>
    );
  const done = await latestIntake(convo.requestId);
  if (done)
    return (
      <main className="wrap">
        <Brand />
        <section className="card stack">
          <h1 style={{ fontSize: 28 }}>Thank you, we&apos;ve got your intake form</h1>
          <p>Your counsellor will read it before your discovery session. If anything changes, just let us know.</p>
        </section>
        <SiteFooter />
      </main>
    );
  const { rows } = await pool.query<{ first_name: string; full_name: string; email: string; phone: string; gender: string }>(
    "SELECT first_name, full_name, email, phone, gender FROM support_requests WHERE id = $1",
    [convo.requestId],
  );
  const r = rows[0];
  const parts = (r?.full_name || "").trim().split(/\s+/);
  const prefill = {
    firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : r?.first_name ?? "",
    lastName: parts.length > 1 ? parts[parts.length - 1] : "",
    email: r?.email ?? "",
    phone: r?.phone ?? "",
    gender: r?.gender && r.gender !== "Prefer not to say" ? r.gender : "",
  };
  return (
    <main className="wrap">
      <Brand />
      <section className="stack">
        <h1>Intake &amp; Registration Form</h1>
        <p className="lede">
          Please fill this in before your discovery session. It&apos;s read only by your counsellor and our team, and kept
          confidential.
        </p>
      </section>
      <IntakeForm token={token} prefill={prefill} />
      <SiteFooter />
    </main>
  );
}
