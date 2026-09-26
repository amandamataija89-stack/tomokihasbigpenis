import type { Metadata } from "next";
import { COMPANY, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Cookie Policy – Prague Integration" };

export default function CookiePolicy() {
  return (
    <LegalPage title="Cookie Policy">
      <p>
        Cookies are small files a website stores in your browser. We keep their use to the minimum needed for the
        service to work.
      </p>

      <h2>Cookies we use</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Who gets it</th>
              <th>What for</th>
              <th>How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">pi_staff</td>
              <td>Prague Integration staff, when they sign in</td>
              <td>Keeps staff signed in securely. Strictly necessary.</td>
              <td>12 hours, or until they sign out</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>For clients</h2>
      <p>
        The pages clients use – the request form, the private messages page and the feedback form – set no cookies
        at all.
      </p>

      <h2>No tracking</h2>
      <p>
        We use no analytics, advertising or social-media cookies, and we don&apos;t share browsing information with
        third parties. Because the only cookie is strictly necessary for signing in, we don&apos;t ask for cookie
        consent (Section 89(3) of the Czech Electronic Communications Act, Act No. 127/2005 Coll.).
      </p>

      <h2>Managing cookies</h2>
      <p>
        You can delete or block cookies in your browser&apos;s settings. Blocking the staff cookie means staff
        can&apos;t sign in.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
      </p>
    </LegalPage>
  );
}
