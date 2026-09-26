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

## Two kinds of client

| | **EAP clients** | **Private clients** |
| --- | --- | --- |
| Who | Employees of a partner company | Prague Integration's own clients |
| Where they sign up | `/join/<company code>` (or the code on `/`) | `/start`: put this link on your website |
| Counsellor | Offered automatically (see below) | **The coordinator assigns** (they're emailed a "New private client – needs assigning" alert) |
| Sessions | Up to 5; Completed automatically after the 5th | **No limit**; staff set the status to Completed when they finish |
| Late cancellation | Counts as one of the 5 | Counts as a session and is charged |
| Payment | None | Each session has a price (CZK) and a **Mark paid** button; unpaid sessions show on the case and in the list |
| Monthly limit | Counts towards each counsellor's new-clients-per-month | Doesn't count |

Everything else is the same: consents, messages, session emails and reminders, contact promise, feedback.

### Prices, payments and invoices (private clients)

- **Price list** (Pricing & invoices page, coordinators and admins): a price per session for each kind of
  support. A client's **own price** (on their page, under Price and invoicing) overrides it. New sessions
  start with that price; a single session's price can still be changed.
- **Billing details** on the client's page: name or company, address, IČO, DIČ and the email invoices go to.
- **Payments** on the client's page:
  - **Record a payment for sessions**: tick several sessions and record one payment (amount defaults to
    their total). The quick **Mark paid** on a session records a payment for just that one.
  - **Record a prepaid package** (e.g. 5 sessions for 6,000 CZK): unpaid sessions already booked are taken
    from it first, then each new booking, until it's used up. The page shows how many are left.
  - **Delete** a payment and its sessions are unpaid again.
- **Invoices**: every payment can be turned into a PDF invoice in Czech and English (**Invoice PDF**), or
  emailed to the client with the PDF attached (**Email invoice**). Numbers are given automatically from
  **Next invoice number** on the Pricing & invoices page, unless you type one in when recording the payment.
  Fill in the company's IČO, bank account and register entry there first, and check the VAT note with your
  accountant: the default says Prague Integration is not a VAT payer. Invoices are marked as already paid.
- The Pricing & invoices page also shows money received this month and last, unpaid sessions per
  client, and recent payments.
Private clients have a **Private** tag; the **Private clients** tab lists them. Counsellors don't see
unassigned private clients in the pool.

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

All times count from when the client submits the form, so they fit inside
the promise the client is given: **contact within 24 working hours**
(Monday to Friday), or 2 hours if urgent.

1. **Offer.** The moment a client submits, they're offered automatically to
   the available counsellor with the fewest new clients this month who works
   in their language. That counsellor is emailed a link.
2. **Accept or decline within 24 working hours** (Monday to Friday, weekends
   skipped; crisis: 30 minutes), with a reminder email halfway. For example,
   offered Monday 10:00, answer by Tuesday 10:00; offered Friday 16:00,
   answer by Monday 16:00. Booking a session or changing the status also
   counts as accepting.
3. **Decline or no answer: straight to the next available counsellor**,
   automatically and with an email to them, as many times as needed. Nobody
   is offered the same client twice. Nobody waits for the coordinator.
4. **Nobody available?** (everyone full, away, or already passed on them)
   The client waits in the **pool** and the **coordinator is emailed at
   once**. The app still offers them automatically as soon as someone
   becomes available, and meanwhile the coordinator can assign them or a
   counsellor can take them from the pool. When assigning, the coordinator
   can tick "Already agreed with them" to skip acceptance. Setting a case to
   "Nobody" passes it to the next available counsellor.
5. **First contact.** At **18 working hours** after the client submitted
   (1 hour for a crisis), a counsellor who still hasn't made contact gets a
   reminder email with the exact time the client was promised. At **24
   working hours** (2 hours for a crisis) the promise is missed: the
   coordinator and the counsellor are both emailed. The case page shows
   "Promised contact by", in red once it has passed.
6. **Daily summary** for the coordinator from 08:00: clients in the pool,
   offers waiting, promises missed.

Every reminder goes to the counsellor's email with a link to sign in and
see the case. Every step is recorded in the case notes. The times are in
`src/lib/deadlines.ts`.

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

## Messages with the client

Counsellor and client talk on the case, not by personal email or phone.

- On each case, **Messages with …** shows the conversation, with a box to
  write to the client. The first message counts as accepting the client
  and moves a New case to **Contacted**.
- The client gets an email saying there's a new message, with a **private
  link** to their conversation page. They read and reply there, with no
  login. Their confirmation email and every session email include the same
  kind of link, so they can also write first (for example to cancel a
  session).
- A client's reply emails the counsellor looking after them (or the
  coordinator, if nobody has the case yet) with a link to sign in. The
  requests list shows "1 new message" until they open the case.
- **Emails never contain what anyone wrote**, only that there's a new
  message. The words stay in the app.
- Anyone with a client's link can read that conversation, so the pages tell
  clients to keep it to themselves. Links stop working 30 days after a case
  is completed or closed.
- Other counsellors can't see or write in a conversation that isn't theirs.

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
| `/start` | Private client | Request form without a company code |
| `/feedback/<link>` | Client | One-use anonymous feedback form |
| `/messages/<link>` | Client | Their private conversation with their counsellor |
| `/admin` | Staff | My clients (counsellors) or all requests (coordinators, admins), plus the pool |
| `/admin/requests/<id>` | Staff | The case: accept/decline, sessions, status, notes |
| `/admin/availability` | Staff | Their own availability |
| `/admin/team` | Coordinators, admins | Invite staff, roles, availability, monthly counts |
| `/admin/companies` | Coordinators, admins | Company codes and registration links |
| `/admin/feedback` | Admins | Anonymous client feedback |
| `/admin/forgot`, `/admin/set-password/<link>` | Staff | Reset or choose a password |
| `/admin/setup` | You, once | Create the first admin login (needs `SETUP_CODE`) |

Employers never see who registered. The Companies page shows request counts
only, which is what you can report back to a client.

Stack: Next.js 15, Postgres (plain SQL, no ORM), Resend for email.

## The hourly job

`/api/cron/overdue` runs every hour. It sends offer reminders, passes
unanswered offers to the next counsellor, offers waiting clients when someone
becomes available, sends first-contact reminders and missed-promise alerts,
the coordinator's daily summary and the clients' 48-hour session reminders.
Because crisis offers last 30 minutes, running it every 15 minutes is better
if your scheduler allows it.

`vercel.json` asks Vercel to call it hourly with the `CRON_SECRET`
environment variable (set it to any long random string). **Vercel's free
Hobby plan only runs scheduled jobs once a day**, so either use the Pro plan,
or have a free service such as cron-job.org call
`https://<your app>/api/cron/overdue` every hour with the header
`Authorization: Bearer <CRON_SECRET>`.

## Deploying

No command line needed. The database sets itself up on every deploy.

1. **Database.** Create a Postgres database on [Neon](https://neon.tech) in
   the Frankfurt region (AWS Europe Central 1). Under **Connect**, turn on
   connection pooling and copy the connection string.
2. **Hosting.** On [Vercel](https://vercel.com) (Pro plan for commercial
   use), import this GitHub repository and set:
   - **Root Directory:** `eap-app`
   - **Environment variables** (see `.env.example`):
     - `DATABASE_URL`: the Neon connection string
     - `APP_URL`: the address people will use, e.g. `https://eap.pragueintegration.cz`
     - `RESEND_API_KEY`, `EMAIL_FROM`, `TEAM_NOTIFY_EMAIL`
     - `SETUP_CODE`: a code you make up, used once in step 3
     - `CRON_SECRET`: any long random string (see "The hourly job")
   - After the first deploy: **Settings → Functions → Region: Frankfurt (fra1)**.
3. **Your admin login.** Open `https://<your app>/admin/setup`, type the
   setup code, your name, email and a password. The page closes for good
   once an admin exists.
4. **Team and companies.** On the Team page, invite your coordinator and
   counsellors; they get an email to choose their password. Under
   Companies, add your first client and send the link to their HR team.
5. Optionally point a subdomain such as `eap.pragueintegration.cz` at it
   (Vercel → Settings → Domains), then update `APP_URL` and redeploy.

Every later deploy updates the database automatically (`npm run
vercel-build` runs `db/schema.sql`, which is safe to run repeatedly).

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

- **Response times (confirmed):** clients are promised contact within 24
  working hours (Monday to Friday), or as soon as possible if urgent; offers
  last 24 working hours (30 minutes for a crisis). Only weekends are skipped, not public
  holidays.
- **Cancellation policy (confirmed):** sessions cancelled with less than 48
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
