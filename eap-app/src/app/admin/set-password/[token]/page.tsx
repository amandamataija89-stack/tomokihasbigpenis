import Link from "next/link";
import { Brand } from "@/components/Brand";
import { tokenOwner } from "@/lib/staff-accounts";
import { SetPasswordForm } from "./SetPasswordForm";

export const metadata = { title: "Choose a password · Prague Integration EAP" };

export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const owner = await tokenOwner(token);
  return (
    <main className="wrap" style={{ maxWidth: 440 }}>
      <Brand href="/admin" />
      {owner ? (
        <>
          <h1>Choose your password</h1>
          <p className="lede">
            For {owner.name} ({owner.email}). You&apos;ll use this email and password to sign in.
          </p>
          <SetPasswordForm token={token} />
        </>
      ) : (
        <section className="card stack">
          <h1 style={{ fontSize: 28 }}>This link has expired</h1>
          <p>Links work once. Invitations last 7 days, and reset links 1 hour.</p>
          <p>
            <Link href="/admin/forgot">Get a new link</Link>, or ask your coordinator to resend your invitation.
          </p>
        </section>
      )}
    </main>
  );
}
