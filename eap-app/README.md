# Prague Integration EAP app

A web app for Prague Integration's Employee Assistance Programme. It has two sides:

- **Employees** open their company's link (or enter its code at the home page),
  fill in a short confidential request, and get an email confirming that the
  team will contact them within 24 hours.
- **Prague Integration staff** sign in at `/admin` to see new requests,
  track status (New → Contacted → Completed, or Closed), keep notes,
  and delete a request when someone asks for their data to be erased. Staff
  also add client companies there, which creates each company's code and
  registration link.

Employees also say whether they need help urgently, what they need help
with (topics and/or their own words), their age range, gender, where they're
based, and whether they want online or in-person sessions.

## Sharing out clients

Each therapist has a limit of new clients per calendar month (5 by default;
10 therapists × 5 = 50 places a month). Set the team up under **Team**.

- Each new request goes to the therapist with the fewest new clients this
  month, then whoever has waited longest since their last one.
- Anyone at their limit is skipped and the case passes to the next therapist.
- Therapists who work in the person's language come first. If they're all
  full, the case goes to another therapist with space, with a note to check
  the language. A therapist with no languages ticked takes any language.
- If every therapist is full, the request waits, marked "Needs assigning".
  It's assigned automatically as soon as a place opens: a new month, a raised
  limit, or a therapist added or back to taking clients.
- **Crisis cases never wait.** If everyone is full, they go to the least-busy
  therapist over their limit. They're flagged in red, sorted to the top, and
  their alert emails say URGENT. Staff can mark or unmark a crisis on the case.
- Staff can always reassign a case by hand. The dropdown shows each person's
  count for the month. Reassigning counts towards the new therapist's month.
- The assigned therapist is emailed a link to the case (no details in the
  email). Therapists added on the Team page can't sign in until given a
  password with `npm run staff:create -- <their email> "<name>"`.

## Sessions

Each client gets up to 5 sessions. On a case, under **Sessions**:

- Book each session with its own date and time. Booking the first one moves
  a New case to "Contacted".
- Move a session to a new time, or remove it.
- Press **Mark done** after each session happens. When all 5 are done the
  case becomes **Completed** (and leaves the Open list). Undo puts it back to
  Contacted.
- A session whose date has passed without being marked done shows in red,
  on the case and in the requests list.
- **The client is emailed automatically** when a session is booked, moved or
  removed. Each form has a tick box (on by default) to skip the email. The
  email gives the date and time (Prague time), the therapist's name,
  session number (e.g. 2 of 5) and where to meet (the Mezibranská 4 address for
  in-person sessions). It never mentions why the person is coming.
- **Session emails go to** shows the client's address from their request.
  Staff can change it there, for example to a personal address.

The number of sessions is `SESSIONS_PER_CLIENT` in `src/lib/data.ts`.

Employers never see who registered. The Companies page shows request counts
only, which is what you can report back to a client.

## How it works

| Page | Who | What |
| --- | --- | --- |
| `/` | Employee | Enter company code |
| `/join/ABCD-EFGH` | Employee | Request form for that company |
| `/admin` | Staff | Requests, filterable by status; new ones older than 24 h show in red |
| `/admin/requests/<id>` | Staff | Full request, sessions, status, assignee, notes, delete |
| `/admin/team` | Staff | Therapists, their languages, monthly limit and this month's count |
| `/admin/companies` | Staff | Add a company, copy its link, pause it, see request counts |

When a request comes in, the team gets an email at `TEAM_NOTIFY_EMAIL` with a
link to it. That email deliberately contains nothing the person wrote; the
details are only visible after signing in.

Stack: Next.js 15, Postgres (plain SQL, no ORM), Resend for email (the same
account as the outreach scripts can be reused).

## Deploying

1. **Database.** Create a Postgres database hosted in the EU, e.g.
   [Neon](https://neon.tech) or [Supabase](https://supabase.com) in the
   Frankfurt region. Copy its connection string.
2. **Create the tables and your first staff login** from a computer with
   Node 20+:
   ```sh
   cd eap-app
   npm install
   DATABASE_URL="postgres://..." npm run db:migrate
   DATABASE_URL="postgres://..." npm run staff:create -- amanda@pragueintegration.cz "Amanda Mataija"
   ```
   The second command prints a generated password. Run it once for each
   colleague who should see requests. Running it again for the same email
   resets that person's password and signs them out.
3. **Hosting.** Import the repository into [Vercel](https://vercel.com), set
   the project's root directory to `eap-app`, choose the Frankfurt
   (`fra1`) function region, and add the environment variables from
   `.env.example`:
   - `DATABASE_URL`: the connection string from step 1
   - `APP_URL`: the address the app will live at, e.g. `https://eap.pragueintegration.cz`
   - `RESEND_API_KEY`, `EMAIL_FROM`, `TEAM_NOTIFY_EMAIL`
4. Optionally point a subdomain such as `eap.pragueintegration.cz` at it.
5. Sign in at `/admin`, add your first client under **Companies**, and send
   the link to their HR team.

## Local development

```sh
cp .env.example .env.local   # fill in DATABASE_URL
npm install
npm run db:migrate
npm run dev
```

Without `RESEND_API_KEY`, emails are printed to the terminal instead of sent.

Checks: `npm run lint` (TypeScript) and `npm test` (unit tests for codes,
passwords and form validation).

## Before going live, please confirm

- **"Within 24 hours."** The form, confirmation page and emails promise
  contact within 24 hours, copied from your GP referral process. Change the
  wording if the EAP runs differently.
- **Confidentiality wording.** Pages tell employees their employer is not
  told who asks for support or why. Make sure your client contracts say the
  same.
- **Legal basis.** The form collects health-related information with explicit
  consent (GDPR Art. 9(2)(a)). Have your privacy policy cover it, and consider
  a data processing agreement with your database and hosting providers.
- **Crisis numbers.** The pages list 112 and Linka první psychické pomoci
  (116 123).
- **Crisis response time.** The staff list turns a crisis case red after 2
  hours without contact. Adjust `isOverdue` in `src/app/admin/format.ts` to
  your own protocol, and decide who covers crisis cases out of hours: the app
  only emails, it doesn't phone anyone.

## Not included yet

- Video-call links in session emails (the email says the therapist will send
  joining details)
- Session emails in Czech (they're in English)

- Czech-language version of the pages
- Online booking of session times
- Staff accounts managed from the app (they're created with the command above)
- Brute-force protection on staff sign-in beyond a short delay; use long
  passwords
