-- Prague Integration EAP. Safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
