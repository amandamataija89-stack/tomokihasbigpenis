import Link from "next/link";
import { Brand } from "@/components/Brand";
import { adminExists } from "@/lib/staff-accounts";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "Set up · Prague Integration EAP" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const done = await adminExists();
  return (
    <main className="wrap" style={{ maxWidth: 480 }}>
      <Brand href="/admin" />
      {done ? (
        <section className="card stack">
          <h1 style={{ fontSize: 28 }}>Setup is done</h1>
          <p>An admin login already exists, so this page is closed.</p>
          <Link href="/admin/login">Go to sign in</Link>
        </section>
      ) : (
        <>
          <h1>Create your admin login</h1>
          <p className="lede">
            This is a one-time step. You&apos;ll be the admin: you see everything, including client feedback, and you
            invite everyone else from the Team page.
          </p>
          <SetupForm />
        </>
      )}
    </main>
  );
}
