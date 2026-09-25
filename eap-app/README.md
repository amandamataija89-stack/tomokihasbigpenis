# Prague Integration EAP app

A web app for Prague Integration's Employee Assistance Programme.

- **Employees** open their company's link (or enter its code at the home
  page) and fill in a short confidential request. They give a nickname (full
  name optional), whether they need help urgently, what they need help with,
  age range, gender, where they're based, online or in person, language and
  how to contact them. They must give two consents: to be contacted, and to
  have their information stored and shared with the counsellor and
  coordinator handling it (never with their employer).
- **Prague Integration staff** sign in at `/admin`. What they see depends on
  their role.

## Roles

| Role | Sees | Can |
| --- | --- | --- |
| **Counsellor** | Only their own clients, plus the pool (without names or contact details) | Accept or decline offered clients, take clients from the pool, book sessions, keep notes, set their own availability |
| **Coordinator** | Every case | Everything a counsellor can, plus assign clients from the pool, invite staff, manage companies, delete requests |
| **Admin** | Everything | Everything a coordinator can, plus read anonymous client feedback and change roles |

A counsellor who opens another counsellor's case by its address gets "not
found".

## Staff logins

Nobody sends passwords around.

1. A coordinator or admin adds the person on the **Team** page (name, email,
   role, new clients per month).
2. The person gets an **invitation email** with a link to choose their own
   password (at least 12 characters). The link works once and lasts 7 days.
   "Resend invitation" on their Team card sends a fresh one.
3. They sign in at `/admin` with their email and password.
4. **Forgot your password?** on the sign-in page emails a reset link that
   lasts 1 hour. It gives the same message whether or not the address has a
   login.

Clients are only offered to counsellors who have set their password.

## How new clients reach a counsellor

1. **Offer.** A new request is offered automatically to the available
   counsellor with the fewest new clients this month who works in the
   client's language (then whoever has waited longest). The counsellor is
   emailed a link.
2. **Accept or decline.** The counsellor signs in and presses **Accept** or
   **Decline** (with an optional reason for the coordinator). Booking a
   session or changing the status also counts as accepting.
3. **Deadline: 24 working hours** (weekends don't count; crisis cases: 2
   hours). Halfway there, an unanswered offer gets a **reminder email**. If
   there's still no answer by the deadline, or the counsellor declines, the
   client goes to the **pool**. They're never offered again to the same
   counsellor.
4. **The pool.** Counsellors see pool clients without names or contact
   details, and can press **Take this client**. The **coordinator** gets a
   **daily summary email** from 08:00 (clients in the pool, offers waiting,
   overdue contacts), signs in and assigns them. When assigning, the
   coordinator can tick "Already agreed with them" to skip acceptance.
   A crisis case going back to the pool emails the coordinator straight away.
5. **First contact.** Once accepted, the counsellor should contact the client
   within 24 working hours (2 hours for a crisis), or they get a reminder
   email.

Every reminder goes to the counsellor's email with a link to sign in and
see the case. Every step is recorded in the case notes.

### Sharing out clients

- Each counsellor has a limit of new clients per calendar month (5 by
  default; 10 counsellors × 5 = 50 places). Anyone at their limit is skipped.
- Counsellors who work in the client's language come first. If they're all
  full, another counsellor with space gets the offer, with a note to check
  the language.
- If every counsellor is full, the request waits and is offered as soon as a
  place opens: a new month, a raised limit, someone back from being away.
- **Crisis cases never wait.** If everyone is full, they go to the least-busy
  counsellor over their limit. They're flagged in red and sorted to the top,
  and their emails say URGENT.

### Availability

Every staff member has **My availability**: taking new clients on/off, new
clients per month (counsellors can choose up to 5; a coordinator can set
more on the Team page), **away until** a date, and languages. Offers skip
anyone who isn't available.

## Sessions

Each client gets up to 5 sessions. On a case, under **Sessions**:

- Book each session with its own date and time. Booking the first one moves
  a New case to **Contacted**.
- **Mark done** after each session. The first one moves the case to **In
  progress**; the fifth to **Completed**.
- **Late cancellation**: the client cancelled with less than 48 hours'
  notice. It **counts as one of the 5 sessions**, like a session that
  happened.
- **Remove (cancelled in time)**: it doesn't count.
- A session whose date has passed without being marked shows in red.
- **Emails to the client** (on by default, can be unticked): when a session
  is booked, moved or removed. The **first booking email includes the
  cancellation policy**. Every session gets a **reminder email 48 hours
  before** (sent just before the 48-hour point, so the client can still cancel
  in time) that repeats the policy and gives the time to cancel by. Emails give
  the date, time, counsellor, session number and where to meet, never the
  reason for coming.
- **Session emails go to** shows the client's email; staff can change it.

The number of sessions is `SESSIONS_PER_CLIENT` in `src/lib/data.ts`; the
48 hours is `LATE_CANCEL_HOURS` in `src/lib/deadlines.ts`.

## Anonymous client feedback (admins only)

- When a case is **Completed**, the client is emailed a one-use feedback link
  (once per case). Staff can also send it from the case.
- Answers are stored with only the counsellor and the month: no name, email,
  case or exact date. The link is deleted when used.
- Only admins see the **Feedback** page. With few clients per counsellor a
  month, you might still guess who wrote something.

## Pages

| Page | Who | What |
| --- | --- | --- |
| `/` | Employee | Enter company code |
| `/join/ABCD-EFGH` | Employee | Request form for that company |
| `/feedback/<link>` | Client | One-use anonymous feedback form |
| `/admin` | Staff | My clients (counsellors) or all requests (coordinators, admins), plus the pool |
| `/admin/requests/<id>` | Staff | The case: accept/decline, sessions, status, notes |
| `/admin/availability` | Staff | Their own availability |
| `/admin/team` | Coordinators, admins | Invite staff, roles, availability, monthly counts |
| `/admin/companies` | Coordinators, admins | Company codes and registration links |
| `/admin/feedback` | Admins | Anonymous client feedback |
| `/admin/forgot`, `/admin/set-password/<link>` | Staff | Reset or choose a password |

Employers never see who registered. The Companies page shows request counts
only, which is what you can report back to a client.

Stack: Next.js 15, Postgres (plain SQL, no ORM), Resend for email.

## The hourly job

`/api/cron/overdue` runs every hour. It sends offer reminders, returns
unanswered offers to the pool, offers waiting clients when places open, sends
first-contact reminders, the coordinator's daily summary and the clients'
48-hour session reminders.

`vercel.json` asks Vercel to call it hourly with the `CRON_SECRET`
environment variable (set it to any long random string). **Vercel's free
Hobby plan only runs scheduled jobs once a day**, so either use the Pro plan,
or have a free service such as cron-job.org call
`https://<your app>/api/cron/overdue` every hour with the header
`Authorization: Bearer <CRON_SECRET>`.

## Deploying

1. **Database.** Create a Postgres database hosted in the EU, e.g.
   [Neon](https://neon.tech) or [Supabase](https://supabase.com) in the
   Frankfurt region. Copy its connection string.
2. **Create the tables and your own admin login** from a computer with
   Node 20+ (this is the only time you use the command line for logins):
   ```sh
   cd eap-app
   npm install
   DATABASE_URL="postgres://..." npm run db:migrate
   DATABASE_URL="postgres://..." npm run staff:create -- amanda@pragueintegration.cz "Amanda Mataija"
   DATABASE_URL="postgres://..." npm run staff:admin -- amanda@pragueintegration.cz
   ```
   `staff:create` prints a generated password; you can change it later with
   "Forgot your password?". After that, invite everyone else from the
   **Team** page.
3. **Hosting.** Import the repository into [Vercel](https://vercel.com), set
   the project's root directory to `eap-app`, choose the Frankfurt
   (`fra1`) function region, and add the environment variables from
   `.env.example`:
   - `DATABASE_URL`: the connection string from step 1
   - `APP_URL`: the address the app will live at, e.g. `https://eap.pragueintegration.cz`
   - `RESEND_API_KEY`, `EMAIL_FROM`, `TEAM_NOTIFY_EMAIL`
   - `CRON_SECRET`: any long random string (see "The hourly job")
4. Optionally point a subdomain such as `eap.pragueintegration.cz` at it.
5. Sign in at `/admin`, invite your coordinator and counsellors under
   **Team**, add your first client under **Companies**, and send the link to
   their HR team.

After updating the app, run `npm run db:migrate` again. It's safe to run
more than once.

## Local development

```sh
cp .env.example .env.local   # fill in DATABASE_URL
npm install
npm run db:migrate
npm run dev
```

Without `RESEND_API_KEY`, emails are printed to the terminal instead of sent.

Checks: `npm run lint` (TypeScript) and `npm test` (unit tests).

## Before going live, please confirm

- **Response times.** The client pages and emails promise contact "within 24
  hours". With 24 working hours to accept plus 24 to make contact, it can
  now take longer, especially over a weekend. Change the wording, or shorten
  the times in `src/lib/deadlines.ts`.
- **Cancellation policy.** Emails say sessions cancelled with less than 48
  hours' notice count as one of the 5. Make sure client contracts say the
  same.
- **Confidentiality wording.** Pages tell employees their employer is not
  told who asks for support or why.
- **Legal basis.** The form collects health-related information with explicit
  consent (GDPR Art. 9(2)(a)) and records when each consent was given. Have
  your privacy policy cover it, and consider data processing agreements with
  your database and hosting providers.
- **Crisis cover.** The app only emails; decide who covers crisis cases out
  of hours. Crisis numbers shown: 112 and Linka první psychické pomoci
  (116 123).

## Not included yet

- Czech-language pages and emails
- Video-call links in session emails
- Online self-booking of session times by clients
- Public holidays in "working hours" (only weekends are skipped)
- Brute-force protection on staff sign-in beyond a short delay
