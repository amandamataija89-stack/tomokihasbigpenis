import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import Link from "next/link";
import { currentStaff } from "@/lib/auth";
import { adminExists } from "@/lib/staff-accounts";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Staff sign in · Prague Integration EAP" };

export default async function LoginPage() {
  if (await currentStaff()) redirect("/admin");
  return (
    <main className="wrap" style={{ maxWidth: 440 }}>
      <Brand href="/admin" />
      <h1>Staff sign in</h1>
      {!(await adminExists()) && (
        <p className="notice">
          <b>First time?</b> No admin login exists yet. <Link href="/admin/setup">Create yours here</Link>.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
