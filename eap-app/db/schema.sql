-- Prague Integration EAP. Safe to run more than once.

DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pgcrypto; EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS staff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  token_hash text PRIMARY KEY,
  staff_id   uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  code          text NOT NULL UNIQUE,
  active        boolean NOT NULL DEFAULT true,
  hr_contact    text NOT NULL DEFAULT '',
  notes         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id),
  first_name      text NOT NULL,
  email           text NOT NULL,
  phone           text NOT NULL DEFAULT '',
  contact_method  text NOT NULL,
  language        text NOT NULL,
  format          text NOT NULL,
  topics          text[] NOT NULL DEFAULT '{}',
  message         text NOT NULL DEFAULT '',
  consent_at      timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'contacted', 'scheduled', 'closed')),
  assigned_to     uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_requests_status_idx ON support_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_requests_company_idx ON support_requests (company_id);

CREATE TABLE IF NOT EXISTS request_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  staff_id   uuid REFERENCES staff(id) ON DELETE SET NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Automatic assignment: therapists take up to monthly_capacity new clients per calendar month.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS takes_clients boolean NOT NULL DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS monthly_capacity integer NOT NULL DEFAULT 5 CHECK (monthly_capacity >= 0);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}';
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
UPDATE support_requests SET assigned_at = updated_at WHERE assigned_to IS NOT NULL AND assigned_at IS NULL;
CREATE INDEX IF NOT EXISTS support_requests_assigned_idx ON support_requests (assigned_to, assigned_at);

-- Triage details from the request form.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS crisis boolean NOT NULL DEFAULT false;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS age_range text NOT NULL DEFAULT '';
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT '';
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';

-- Sessions: each client gets up to 5; the case is completed when all are done.
ALTER TABLE support_requests DROP CONSTRAINT IF EXISTS support_requests_status_check;
ALTER TABLE support_requests ADD CONSTRAINT support_requests_status_check
  CHECK (status IN ('new', 'contacted', 'scheduled', 'in_progress', 'completed', 'closed'));

CREATE TABLE IF NOT EXISTS client_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  starts_at  timestamptz NOT NULL,
  done_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_sessions_request_idx ON client_sessions (request_id, starts_at);

-- When the assigned counsellor was warned that a case hasn't been contacted in time (sent once per assignment).
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS overdue_warned_at timestamptz;

-- Anonymous client feedback, readable only by admins.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- One-use links. Deleted when used, so a response can't be traced back to the client or case.
CREATE TABLE IF NOT EXISTS feedback_invites (
  token_hash    text PRIMARY KEY,
  counsellor_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  expires_at    timestamptz NOT NULL
);

-- No client, case or exact time is stored with a response: only the counsellor and the month.
CREATE TABLE IF NOT EXISTS feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counsellor_id   uuid REFERENCES staff(id) ON DELETE SET NULL,
  submitted_month date NOT NULL,
  overall         integer NOT NULL CHECK (overall BETWEEN 1 AND 5),
  counsellor_rating integer CHECK (counsellor_rating BETWEEN 1 AND 5),
  helped          text NOT NULL,
  recommend       text NOT NULL,
  comments        text NOT NULL DEFAULT ''
);

-- Roles: admin (sees everything, including feedback), coordinator (sees and assigns all cases),
-- counsellor (sees only their own clients and the pool).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'counsellor'
  CHECK (role IN ('admin', 'coordinator', 'counsellor'));
UPDATE staff SET role = 'admin' WHERE is_admin AND role = 'counsellor';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS away_until date;

-- One-use links for setting a password (invitations and "forgot password").
CREATE TABLE IF NOT EXISTS password_tokens (
  token_hash text PRIMARY KEY,
  staff_id   uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

-- Nickname lives in first_name; the full name is optional. consent_at is consent to store and share,
-- consent_contact_at is consent to be contacted.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS consent_contact_at timestamptz;

-- Offers: an assigned counsellor accepts or declines. No answer by respond_by, or a decline,
-- puts the case in the pool for the coordinator (or another counsellor) to pick up.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS respond_by timestamptz;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS in_pool boolean NOT NULL DEFAULT false;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS declined_by uuid[] NOT NULL DEFAULT '{}';
UPDATE support_requests SET accepted_at = assigned_at
  WHERE assigned_to IS NOT NULL AND accepted_at IS NULL AND status <> 'new';

CREATE TABLE IF NOT EXISTS app_state (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Reminder sent halfway to an offer's respond_by, so the counsellor signs in to accept or decline.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS offer_reminded_at timestamptz;

-- A late cancellation counts towards the client's sessions like a session that happened (done_at is set too).
ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS late_cancelled boolean NOT NULL DEFAULT false;
-- The client's reminder email, sent 48 hours before the session.
ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- When the coordinator was told a client's contact promise was missed (once per case).
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS contact_missed_at timestamptz;

-- Conversation between the counsellor and the client, on the case. The client reads and replies on a
-- private page reached by a link in their emails (no login). Emails never contain the message text.
CREATE TABLE IF NOT EXISTS client_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  sender     text NOT NULL CHECK (sender IN ('staff', 'client')),
  staff_id   uuid REFERENCES staff(id) ON DELETE SET NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX IF NOT EXISTS client_messages_request_idx ON client_messages (request_id, created_at);

-- Private links to a client's conversation page. Several can be valid at once (one per email sent).
CREATE TABLE IF NOT EXISTS message_links (
  token_hash text PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Two kinds of client: 'eap' (through an employer's company code: 5 sessions, offered automatically)
-- and 'private' (Prague Integration's own clients: no company, no session limit, assigned by the coordinator).
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'eap';
ALTER TABLE support_requests ALTER COLUMN company_id DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE support_requests ADD CONSTRAINT support_requests_kind_check
    CHECK ((kind = 'eap' AND company_id IS NOT NULL) OR (kind = 'private' AND company_id IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payment for private clients' sessions: price in CZK and when it was paid.
ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS price_czk integer CHECK (price_czk IS NULL OR price_czk >= 0);
ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Private clients: the kind of support they asked for (individual, couple, children/teenager, ADHD testing).
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS service text NOT NULL DEFAULT '';

-- ---- Billing for private clients ----------------------------------------------------
-- Price list by support type; a client's own price (below) overrides it. NULL means no price set.
CREATE TABLE IF NOT EXISTS price_list (
  service    text PRIMARY KEY,
  price_czk  integer CHECK (price_czk IS NULL OR price_czk >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO price_list (service) VALUES
  ('Individual counselling'), ('Couple counselling'), ('Children or teenager counselling'), ('ADHD testing')
ON CONFLICT (service) DO NOTHING;

-- The client's profile: their own session price and who the invoice is made out to.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS session_price_czk integer CHECK (session_price_czk IS NULL OR session_price_czk >= 0);
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS billing_name text NOT NULL DEFAULT '';
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS billing_address text NOT NULL DEFAULT '';
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS billing_ico text NOT NULL DEFAULT '';
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS billing_dic text NOT NULL DEFAULT '';
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS billing_email text NOT NULL DEFAULT '';

-- A payment covers one or more sessions, or buys a package of sessions. It can have one invoice.
CREATE TABLE IF NOT EXISTS payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  amount_czk     integer NOT NULL CHECK (amount_czk >= 0),
  paid_on        date NOT NULL,
  method         text NOT NULL DEFAULT 'Bank transfer',
  invoice_number text UNIQUE,
  invoiced_at    timestamptz,
  staff_id       uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_request_idx ON payments (request_id, paid_on);

-- A prepaid package: its sessions are taken from it as they're booked.
CREATE TABLE IF NOT EXISTS packages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  sessions   integer NOT NULL CHECK (sessions > 0),
  price_czk  integer NOT NULL CHECK (price_czk >= 0),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- paid_at stays the "is it paid" flag; these say which payment or package paid for the session.
ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;
ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES packages(id) ON DELETE SET NULL;

-- Price ranges without VAT, per kind of support: the counsellor picks each client's price from it.
ALTER TABLE price_list ADD COLUMN IF NOT EXISTS min_net_czk integer CHECK (min_net_czk IS NULL OR min_net_czk >= 0);
ALTER TABLE price_list ADD COLUMN IF NOT EXISTS max_net_czk integer CHECK (max_net_czk IS NULL OR max_net_czk >= 0);
UPDATE price_list SET min_net_czk = 900, max_net_czk = 2300
  WHERE service = 'Individual counselling' AND min_net_czk IS NULL AND max_net_czk IS NULL;
UPDATE price_list SET min_net_czk = 2000, max_net_czk = 3000
  WHERE service = 'Couple counselling' AND min_net_czk IS NULL AND max_net_czk IS NULL;
UPDATE price_list SET min_net_czk = 1400, max_net_czk = 1600
  WHERE service = 'Children or teenager counselling' AND min_net_czk IS NULL AND max_net_czk IS NULL;
-- The client's price without VAT, as chosen by their counsellor (session_price_czk is the same with VAT).
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS session_price_net_czk integer
  CHECK (session_price_net_czk IS NULL OR session_price_net_czk >= 0);

-- Invoices to pay later: a payment row with no paid_on yet is an issued invoice awaiting payment.
ALTER TABLE payments ALTER COLUMN paid_on DROP NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS due_on date;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS period text; -- 'YYYY-MM' for a monthly invoice
ALTER TABLE payments ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS overdue_reminded_at timestamptz;
CREATE INDEX IF NOT EXISTS payments_unpaid_idx ON payments (due_on) WHERE paid_on IS NULL;

-- Each private client has their own variable symbol, used on all their invoices.
CREATE SEQUENCE IF NOT EXISTS client_vs_seq START 100001;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS variable_symbol text;
CREATE UNIQUE INDEX IF NOT EXISTS support_requests_vs_idx ON support_requests (variable_symbol);
UPDATE support_requests SET variable_symbol = nextval('client_vs_seq')::text
  WHERE kind = 'private' AND variable_symbol IS NULL;

-- Prague Integration's company details, filled in where they haven't been set yet.
UPDATE app_state SET value = (value::jsonb || jsonb_build_object(
    'supplierName', 'Prague Integration s.r.o.', 'supplierAddress', E'Olšanská 4E\n130 00 Praha 3',
    'ico', '21048428', 'dic', 'CZ21048428', 'bankAccount', '5454387003/5500', 'iban', 'CZ4555000000005454387003',
    'dueDays', 14))::text
  WHERE key = 'invoice_settings' AND COALESCE(value::jsonb->>'ico', '') = '';

-- Private clients' residential address, from the sign-up form (their invoices are made out to them).
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';

-- A coordinator's own amount on an invoice; otherwise the amount follows its sessions' prices.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_manual boolean NOT NULL DEFAULT false;
-- When the coordinator sent the client a payment reminder for an overdue invoice.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS client_reminded_at timestamptz;

-- Transactions read from uploaded bank statements, so importing the same statement twice changes nothing.
CREATE TABLE IF NOT EXISTS bank_transactions (
  key         text PRIMARY KEY,
  booked_on   date NOT NULL,
  amount      numeric(12, 2) NOT NULL,
  vs          text NOT NULL DEFAULT '',
  payment_id  uuid REFERENCES payments(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

-- Extra lines a coordinator adds to an invoice (e.g. a report, a test fee), with VAT included.
CREATE TABLE IF NOT EXISTS invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount_czk  integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_items_payment_idx ON invoice_items (payment_id);

-- The informed consent form, signed online by the client (or a parent/guardian for a minor) before the
-- first session. Keeps what was filled in, the drawn signature and exactly which wording was agreed to.
CREATE TABLE IF NOT EXISTS consent_forms (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  version               text NOT NULL,
  text_sha256           text NOT NULL,
  full_name             text NOT NULL,
  home_address          text NOT NULL,
  local_address         text NOT NULL DEFAULT '',
  phone                 text NOT NULL,
  email                 text NOT NULL,
  emergency_name        text NOT NULL,
  emergency_contact     text NOT NULL, -- relationship, email / telephone
  other_info            text NOT NULL DEFAULT '',
  for_minor             boolean NOT NULL DEFAULT false,
  guardian_name         text NOT NULL DEFAULT '',
  signed_name           text NOT NULL, -- typed by whoever signs (client, or guardian for a minor)
  signature_png         text NOT NULL, -- the drawn signature, as a base64 PNG
  signed_at             timestamptz NOT NULL DEFAULT now(),
  ip                    text NOT NULL DEFAULT '',
  user_agent            text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS consent_forms_request_idx ON consent_forms (request_id, signed_at DESC);
-- When the client was last sent the link to sign it.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS consent_form_sent_at timestamptz;

-- When a finished case's client record was reduced to what its invoices need (see src/lib/retention.ts).
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

-- The counsellor's own notes on a client: only the counsellor looking after the client can read them
-- (not coordinators or admins, unless they are that client's counsellor).
CREATE TABLE IF NOT EXISTS counsellor_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  staff_id   uuid REFERENCES staff(id) ON DELETE SET NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS counsellor_notes_request_idx ON counsellor_notes (request_id, created_at DESC);

-- The steps with a new private client: offer a free discovery session, book it and send the intake form,
-- then (if they choose counselling) send the consent form and payment information.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS discovery_offered_at timestamptz;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS intake_sent_at timestamptz;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS counselling_agreed_at timestamptz;
-- A free discovery session (not charged, not invoiced, not counted as one of the EAP sessions).
ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS is_discovery boolean NOT NULL DEFAULT false;
-- Added by staff rather than through the website.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES staff(id) ON DELETE SET NULL;

-- The intake & registration form the client fills in before their discovery session.
CREATE TABLE IF NOT EXISTS intake_forms (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  answers                jsonb NOT NULL, -- every answer, as filled in (see src/lib/intake.ts)
  signed_name            text NOT NULL,
  signature_png          text NOT NULL,
  signed_at              timestamptz NOT NULL DEFAULT now(),
  ip                     text NOT NULL DEFAULT '',
  user_agent             text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS intake_forms_request_idx ON intake_forms (request_id, signed_at DESC);

-- The owner (Amanda Mataija): sees the bank statements and can open counsellors' private notes in an
-- emergency. Other admins see everything else.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;
UPDATE staff SET is_owner = true WHERE lower(email) = 'amandamataija89@gmail.com' AND NOT is_owner;
-- The owner is always an admin (full access, including sending the onboarding details).
UPDATE staff SET role = 'admin' WHERE is_owner AND role <> 'admin';

-- When a counsellor is usually free for sessions (their own words, e.g. "Mon–Wed 9:00–17:00"), shown to the team.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS availability_note text NOT NULL DEFAULT '';

-- Exact prices to choose from (without VAT), instead of steps of 100 CZK across the range; empty = steps.
ALTER TABLE price_list ADD COLUMN IF NOT EXISTS price_options integer[] NOT NULL DEFAULT '{}';
UPDATE price_list SET price_options = '{2000,2200,2500,3000}', min_net_czk = 2000, max_net_czk = 3000
  WHERE service = 'Couple counselling' AND NOT EXISTS (SELECT 1 FROM app_state WHERE key = 'couple_prices_set');
INSERT INTO app_state (key, value) VALUES ('couple_prices_set', '1') ON CONFLICT (key) DO NOTHING;

-- Group support: groups led by a counsellor, their members (with whether they've signed the consent form),
-- the group's sessions and who attended each.
CREATE TABLE IF NOT EXISTS support_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  kind          text NOT NULL, -- see GROUP_KINDS in src/lib/groups.ts
  counsellor_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  details       text NOT NULL DEFAULT '', -- e.g. day, time, online or in person
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS group_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  first_name        text NOT NULL,
  surname           text NOT NULL,
  email             text NOT NULL,
  consent_signed_on date, -- when they signed the consent form; NULL = not yet
  added_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_members_group_idx ON group_members (group_id);
CREATE TABLE IF NOT EXISTS group_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  starts_at  timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_sessions_group_idx ON group_sessions (group_id, starts_at);
CREATE TABLE IF NOT EXISTS group_attendance (
  session_id uuid NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, member_id)
);

-- Which clients a counsellor takes (see CLIENT_TYPES in src/lib/assign.ts). All by default.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS accepts text[] NOT NULL DEFAULT '{Individuals,Couples,Teenagers,Children,Students}';

-- ADHD testing: 7 000 CZK without VAT (set once; change it under Pricing & invoices).
UPDATE price_list SET min_net_czk = 7000, max_net_czk = 7000, price_options = '{}'
  WHERE service = 'ADHD testing' AND NOT EXISTS (SELECT 1 FROM app_state WHERE key = 'adhd_price_set');
INSERT INTO app_state (key, value) VALUES ('adhd_price_set', '1') ON CONFLICT (key) DO NOTHING;
-- Student discount (STUDENT_DISCOUNT_PERCENT, 10 %) on the client's price, ticked by their counsellor.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS student_discount boolean NOT NULL DEFAULT false;

-- Private clients: when the coordinator was told the discovery offer wasn't sent within 24 hours.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS offer_late_alerted_at timestamptz;

-- The second reminder, 24 hours before the session (the first goes 48 hours before).
ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS reminder24_sent_at timestamptz;

-- The crisis protocol checklist on a crisis case (src/lib/crisis.ts): what was ticked, the risk level
-- and the report. Every save is also written in the team notes, with who and when.
CREATE TABLE IF NOT EXISTS crisis_checklists (
  request_id      uuid PRIMARY KEY REFERENCES support_requests(id) ON DELETE CASCADE,
  checked         text[] NOT NULL DEFAULT '{}',
  risk            text NOT NULL DEFAULT '', -- '', 'low', 'high'
  emergency_call  text NOT NULL DEFAULT '', -- time, person, service contacted (if confidentiality was breached)
  report          text NOT NULL DEFAULT '', -- assessment, risk factors, actions taken
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES staff(id) ON DELETE SET NULL
);

-- Two-step sign-in: after the password, a 6-digit code is emailed (valid 10 minutes, 5 tries).
CREATE TABLE IF NOT EXISTS login_challenges (
  token_hash text PRIMARY KEY,
  staff_id   uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
-- Devices a staff member chose to remember for 30 days (no code needed there).
CREATE TABLE IF NOT EXISTS trusted_devices (
  token_hash text PRIMARY KEY,
  staff_id   uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

-- Who opened which client's record, and when (GDPR accountability). Kept as long as the client record.
CREATE TABLE IF NOT EXISTS access_log (
  id         bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  staff_id   uuid REFERENCES staff(id) ON DELETE SET NULL,
  what       text NOT NULL, -- e.g. 'Opened the record', 'Downloaded the consent form'
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_log_request_idx ON access_log (request_id, at DESC);

-- The counsellor's own online meeting room (Zoom / Google Meet link), sent with online sessions.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS meeting_link text NOT NULL DEFAULT '';
-- A counsellor's own office for in-person sessions; empty = our office at Mezibranská 4.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS office_address text NOT NULL DEFAULT '';
-- Access removed by an admin: can't sign in or reset a password until it's restored.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS removed_at timestamptz;

-- Waiting list: when no suitable counsellor is free, the coordinator puts the client on it. Cleared
-- when they're assigned.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS waitlisted_at timestamptz;

-- Counsellor payouts: their share (%) of their private sessions' fees without VAT, and a fixed fee per
-- EAP session held. Set by an admin on the Team page.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS payout_percent integer NOT NULL DEFAULT 70 CHECK (payout_percent BETWEEN 0 AND 100);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS eap_session_fee integer NOT NULL DEFAULT 0 CHECK (eap_session_fee >= 0);

-- Invoices stay in the app; they're emailed only to clients who asked for them by email.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS email_invoices boolean NOT NULL DEFAULT false;

-- Counsellor warnings: formal warnings (e.g. sessions not marked done after they happened). At 3
-- active warnings the counsellor is suspended from new clients until an admin lifts it.
CREATE TABLE IF NOT EXISTS staff_warnings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  reason     text NOT NULL,
  issued_by  uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz -- when a suspension was lifted (warnings no longer count)
);
CREATE INDEX IF NOT EXISTS staff_warnings_staff_idx ON staff_warnings (staff_id, created_at DESC);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
-- A session not marked done 24 hours after it: the counsellor was reminded (once).
ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS unmarked_reminded_at timestamptz;
-- How many reminders a counsellor has had about this unmarked session (1 at 24 h, 2 at 48 h; at 72 h
-- the owner is told and the counsellor gets a formal warning).
ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS unmarked_reminders integer NOT NULL DEFAULT 0;
UPDATE client_sessions SET unmarked_reminders = 1 WHERE unmarked_reminded_at IS NOT NULL AND unmarked_reminders = 0;

-- A private client can be invoiced for each session separately (issued when it's marked done) instead of
-- one monthly invoice.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS invoice_per_session boolean NOT NULL DEFAULT false;

-- Consent form process: the counsellor asks the coordinator, who sends the form and payment details;
-- the client is reminded if it isn't signed within 72 hours.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS consent_requested_at timestamptz;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS consent_reminded_at timestamptz;

-- Group members sign the same informed consent form online (plus group confidentiality).
CREATE TABLE IF NOT EXISTS group_consent_links (
  token_hash text PRIMARY KEY,
  member_id  uuid NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS group_consent_forms (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  version           text NOT NULL,
  text_sha256       text NOT NULL,
  full_name         text NOT NULL,
  home_address      text NOT NULL DEFAULT '',
  local_address     text NOT NULL DEFAULT '',
  phone             text NOT NULL,
  email             text NOT NULL,
  emergency_name    text NOT NULL,
  emergency_contact text NOT NULL,
  other_info        text NOT NULL DEFAULT '',
  for_minor         boolean NOT NULL DEFAULT false,
  guardian_name     text NOT NULL DEFAULT '',
  signed_name       text NOT NULL,
  signature_png     text NOT NULL,
  signed_at         timestamptz NOT NULL DEFAULT now(),
  ip                text NOT NULL DEFAULT '',
  user_agent        text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS group_consent_forms_member_idx ON group_consent_forms (member_id, signed_at DESC);
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS consent_sent_at timestamptz;
