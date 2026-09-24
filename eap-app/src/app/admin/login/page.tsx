import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { currentStaff } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Staff sign in · Prague Integration EAP" };

export default async function LoginPage() {
  if (await currentStaff()) redirect("/admin");
  return (
    <main className="wrap" style={{ maxWidth: 440 }}>
      <Brand href="/admin" />
      <h1>Staff sign in</h1>
      <LoginForm />
    </main>
  );
}
