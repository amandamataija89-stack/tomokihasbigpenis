import { pool } from "./db";
import type { RequestInput } from "./request-form";

export const STATUSES = ["new", "contacted", "scheduled", "in_progress", "completed", "closed"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = {
  new: "New",
  contacted: "Contacted",
  scheduled: "Session booked",
  in_progress: "In progress",
  completed: "Completed",
  closed: "Closed",
};
// Statuses where the case needs nothing more from the team.
export const FINISHED: readonly Status[] = ["completed", "closed"];
export const SESSIONS_PER_CLIENT = 5;

// EAP clients come through an employer and get SESSIONS_PER_CLIENT sessions; private clients are
// Prague Integration's own, with no session limit, and are assigned by the coordinator.
export type ClientKind = "eap" | "private";
/** How many sessions a client gets, or null for no limit. */
export const sessionLimit = (kind: ClientKind): number | null => (kind === "eap" ? SESSIONS_PER_CLIENT : null);

export type Company = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  hr_contact: string;
  notes: string;
  created_at: Date;
};

export async function findCompanyByCode(code: string): Promise<Company | null> {
  const { rows } = await pool.query<Company>("SELECT * FROM companies WHERE code = $1", [code]);
  return rows[0] ?? null;
}

/** Saves a request: an EAP one for the company given, or a private one when companyId is null. */
export async function insertRequest(companyId: string | null, r: RequestInput): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO support_requests
       (kind, in_pool, company_id, first_name, full_name, email, phone, contact_method, language, format, topics,
        message, crisis, age_range, gender, location, consent_at, consent_contact_at)
     VALUES ($15, $15 = 'private', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())
     RETURNING id`,
    [
      companyId, r.firstName, r.fullName, r.email, r.phone, r.contactMethod, r.language, r.format, r.topics,
      r.message, r.crisis, r.ageRange, r.gender, r.location, companyId ? "eap" : "private",
    ],
  );
  return rows[0].id;
}

export type RequestRow = {
  id: string;
  first_name: string; // the nickname the client gave
  full_name: string;
  email: string;
  phone: string;
  contact_method: string;
  language: string;
  format: string;
  topics: string[];
  message: string;
  crisis: boolean;
  age_range: string;
  gender: string;
  location: string;
  consent_at: Date;
  consent_contact_at: Date | null;
  status: Status;
  kind: ClientKind;
  accepted_at: Date | null;
  respond_by: Date | null;
  in_pool: boolean;
  declined_by: string[];
  assigned_to: string | null;
  assigned_name: string | null;
  company_id: string | null;
  company_name: string | null; // null for private clients
  created_at: Date;
  updated_at: Date;
  sessions_done: number;
  sessions_total: number;
  next_session: Date | null;
  unread: number; // messages from the client not yet read
  unpaid: number; // private clients: sessions that happened (or were late-cancelled) and aren't marked paid
};

const REQUEST_SELECT = `
  SELECT r.*, c.name AS company_name, s.name AS assigned_name,
    (SELECT count(*)::int FROM client_sessions cs WHERE cs.request_id = r.id AND cs.done_at IS NOT NULL) AS sessions_done,
    (SELECT count(*)::int FROM client_sessions cs WHERE cs.request_id = r.id) AS sessions_total,
    (SELECT min(starts_at) FROM client_sessions cs WHERE cs.request_id = r.id AND cs.done_at IS NULL) AS next_session,
    (SELECT count(*)::int FROM client_messages m WHERE m.request_id = r.id AND m.sender = 'client' AND m.read_at IS NULL) AS unread,
    (SELECT count(*)::int FROM client_sessions cs WHERE cs.request_id = r.id AND r.kind = 'private'
       AND cs.done_at IS NOT NULL AND cs.paid_at IS NULL) AS unpaid
  FROM support_requests r
  LEFT JOIN companies c ON c.id = r.company_id
  LEFT JOIN staff s ON s.id = r.assigned_to`;

export type Filter = Status | "open" | "all" | "pool" | "awaiting" | "private";

// SQL condition for each list filter. "pool" is cases waiting for someone to take or assign them.
const FILTER_SQL: Record<"open" | "pool" | "awaiting" | "private", string> = {
  open: "r.status NOT IN ('completed', 'closed')",
  pool: "r.assigned_to IS NULL AND r.status = 'new'",
  awaiting: "r.assigned_to IS NOT NULL AND r.accepted_at IS NULL AND r.status = 'new'",
  private: "r.kind = 'private' AND r.status NOT IN ('completed', 'closed')",
};

/**
 * Cases for a list. With `onlyFor`, just that counsellor's own cases, plus the EAP pool (private clients
 * waiting to be assigned are the coordinator's to place, so counsellors don't see them).
 */
export async function listRequests(filter: Filter, onlyFor?: string): Promise<RequestRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filter === "open" || filter === "pool" || filter === "awaiting" || filter === "private") where.push(FILTER_SQL[filter]);
  else if (filter !== "all") where.push(`r.status = $${params.push(filter)}`);
  if (onlyFor && filter !== "pool") where.push(`r.assigned_to = $${params.push(onlyFor)}`);
  if (onlyFor && filter === "pool") where.push("r.kind = 'eap'");
  const { rows } = await pool.query<RequestRow>(
    `${REQUEST_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY (r.crisis AND r.status NOT IN ('completed', 'closed')) DESC, (r.status = 'new') DESC, r.created_at DESC
     LIMIT 500`,
    params,
  );
  return rows;
}

export async function filterCounts(onlyFor?: string): Promise<Record<Filter, number>> {
  const mine = onlyFor ? "AND assigned_to = $1" : "";
  const { rows } = await pool.query<Record<string, number>>(
    `SELECT
       count(*) FILTER (WHERE TRUE ${mine})::int AS all,
       count(*) FILTER (WHERE status NOT IN ('completed', 'closed') ${mine})::int AS open,
       count(*) FILTER (WHERE assigned_to IS NULL AND status = 'new' ${onlyFor ? "AND kind = 'eap'" : ""})::int AS pool,
       count(*) FILTER (WHERE kind = 'private' AND status NOT IN ('completed', 'closed') ${mine})::int AS private,
       count(*) FILTER (WHERE assigned_to IS NOT NULL AND accepted_at IS NULL AND status = 'new' ${mine})::int AS awaiting,
       ${STATUSES.map((s) => `count(*) FILTER (WHERE status = '${s}' ${mine})::int AS ${s}`).join(", ")}
     FROM support_requests`,
    onlyFor ? [onlyFor] : [],
  );
  return rows[0] as Record<Filter, number>;
}

export async function getRequest(id: string): Promise<RequestRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await pool.query<RequestRow>(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
  return rows[0] ?? null;
}

export type Note = { id: string; body: string; created_at: Date; staff_name: string | null };

export async function listNotes(requestId: string): Promise<Note[]> {
  const { rows } = await pool.query<Note>(
    `SELECT n.id, n.body, n.created_at, s.name AS staff_name
     FROM request_notes n LEFT JOIN staff s ON s.id = n.staff_id
     WHERE n.request_id = $1 ORDER BY n.created_at DESC`,
    [requestId],
  );
  return rows;
}

export { therapistLoads as listStaffWithLoad } from "./assign";

export type CompanyWithCounts = Company & { total: number; last_30_days: number };

// Counts only: this is what can be reported back to the employer, never names.
export async function listCompanies(): Promise<CompanyWithCounts[]> {
  const { rows } = await pool.query<CompanyWithCounts>(
    `SELECT c.*,
       count(r.id)::int AS total,
       count(r.id) FILTER (WHERE r.created_at > now() - interval '30 days')::int AS last_30_days
     FROM companies c LEFT JOIN support_requests r ON r.company_id = c.id
     GROUP BY c.id ORDER BY c.active DESC, c.name`,
  );
  return rows;
}

// done_at is set for sessions that happened and for late cancellations: both count towards the 5.
// price_czk and paid_at are used for private clients, who pay per session.
export type ClientSession = {
  id: string;
  starts_at: Date;
  done_at: Date | null;
  late_cancelled: boolean;
  price_czk: number | null;
  paid_at: Date | null;
};

export async function listSessions(requestId: string): Promise<ClientSession[]> {
  const { rows } = await pool.query<ClientSession>(
    `SELECT id, starts_at, done_at, late_cancelled, price_czk, paid_at FROM client_sessions
     WHERE request_id = $1 ORDER BY starts_at`,
    [requestId],
  );
  return rows;
}
