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
