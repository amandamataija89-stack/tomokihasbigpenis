import { Brand } from "@/components/Brand";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "Reset password · Prague Integration EAP" };

export default function ForgotPage() {
  return (
    <main className="wrap" style={{ maxWidth: 440 }}>
      <Brand href="/admin" />
      <h1>Reset your password</h1>
      <ForgotForm />
    </main>
  );
}
