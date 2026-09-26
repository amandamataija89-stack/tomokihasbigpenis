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
