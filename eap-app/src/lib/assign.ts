import type { PoolClient } from "pg";
import { pool } from "./db";
import { respondBy } from "./deadlines";
import { sendEmail, therapistAlert } from "./email";

export const DEFAULT_MONTHLY_CAPACITY = 5;

// Start of the current calendar month in Prague, as SQL. Monthly counts reset at local midnight on the 1st.
export const MONTH_START_SQL = "(date_trunc('month', now() AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'Europe/Prague')";

export type TherapistLoad = {
  id: string;
  name: string;
  email: string;
  capacity: number;
  languages: string[];
  assignedThisMonth: number;
  lastAssignedAt: Date | null;
};

// A therapist with no languages listed is treated as taking any language.
// "Other" can't be matched automatically, so anyone may take it.
export function speaks(t: Pick<TherapistLoad, "languages">, language: string): boolean {
  return language === "Other" || t.languages.length === 0 || t.languages.includes(language);
}

export type Choice =
  | { therapist: TherapistLoad; languageMatch: boolean }
  | { therapist: null; reason: "no-therapists" | "all-full" };

/**
 * Spreads new clients evenly. A therapist at their monthly limit is skipped and the case
 * goes to the next one: whoever has had the fewest new clients this month, then whoever has
 * waited longest. Therapists who work in the person's language come first; if they are all
 * full, the case goes to another therapist with space and is flagged as a language mismatch.
 */
export function chooseTherapist(
  all: TherapistLoad[],
  language: string,
  crisis = false,
  declinedBy: readonly string[] = [],
): Choice {
  // Someone who already declined this client (or let the offer lapse) isn't offered it again.
  const therapists = all.filter((t) => !declinedBy.includes(t.id));
  if (therapists.length === 0) return { therapist: null, reason: "no-therapists" };
  // A crisis case never waits: if everyone is full it goes over someone's limit, least-loaded first.
  const open = crisis && therapists.every((t) => t.assignedThisMonth >= t.capacity)
    ? therapists
    : therapists.filter((t) => t.assignedThisMonth < t.capacity);
  if (open.length === 0) return { therapist: null, reason: "all-full" };
  const waited = (t: TherapistLoad) => t.lastAssignedAt?.getTime() ?? 0;
  const best = (ts: TherapistLoad[]) =>
    [...ts].sort(
      (a, b) =>
        a.assignedThisMonth - b.assignedThisMonth || waited(a) - waited(b) || a.name.localeCompare(b.name),
    )[0];
  const speakers = open.filter((t) => speaks(t, language));
  if (speakers.length) return { therapist: best(speakers), languageMatch: true };
  return { therapist: best(open), languageMatch: false };
}

export const UNASSIGNED_REASONS: Record<Exclude<Choice, { therapist: TherapistLoad }>["reason"], string> = {
  "no-therapists": "Waiting for a therapist: nobody is set to take new clients. It will be assigned as soon as someone is.",
  "all-full":
    "Waiting for a therapist: everyone has reached their limit of new clients this month. It will be assigned automatically when a place opens, or you can assign it by hand.",
};

type Queryable = Pick<PoolClient, "query">;

// The monthly limit is for new EAP clients; private clients are placed by the coordinator and don't count.
export async function therapistLoads(db: Queryable = pool, onlyTakingClients = true): Promise<TherapistLoad[]> {
  const { rows } = await db.query<{
    id: string;
    name: string;
    email: string;
    monthly_capacity: number;
    languages: string[];
    assigned: number;
    last_assigned_at: Date | null;
  }>(
    `SELECT s.id, s.name, s.email, s.monthly_capacity, s.languages,
       count(r.id) FILTER (WHERE r.assigned_at >= ${MONTH_START_SQL} AND r.kind = 'eap')::int AS assigned,
       max(r.assigned_at) FILTER (WHERE r.kind = 'eap') AS last_assigned_at
     FROM staff s LEFT JOIN support_requests r ON r.assigned_to = s.id
     ${
       onlyTakingClients
         ? // Available: taking clients, not away, and has set a password (so can sign in to accept).
           `WHERE s.takes_clients AND s.password_hash <> '!'
              AND (s.away_until IS NULL OR s.away_until < (now() AT TIME ZONE 'Europe/Prague')::date)`
         : ""
     }
     GROUP BY s.id ORDER BY s.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    capacity: r.monthly_capacity,
    languages: r.languages,
    assignedThisMonth: r.assigned,
    lastAssignedAt: r.last_assigned_at,
  }));
}

export type Assignment = {
  requestId: string;
  therapist: TherapistLoad;
  languageMatch: boolean;
  crisis: boolean;
  respondBy: Date;
};

// Assigns one request inside an open transaction and records why in its notes.
async function assignOne(
  client: PoolClient,
  loads: TherapistLoad[],
  requestId: string,
  language: string,
  crisis: boolean,
  declinedBy: readonly string[],
  noteIfWaiting: boolean,
): Promise<Assignment | null> {
  const choice = chooseTherapist(loads, language, crisis, declinedBy);
  if (!choice.therapist) {
    if (noteIfWaiting)
      await client.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
        requestId,
        UNASSIGNED_REASONS[choice.reason],
      ]);
    return null;
  }
  const t = choice.therapist;
  const deadline = respondBy(new Date(), crisis);
  await client.query(
    `UPDATE support_requests SET assigned_to = $2, assigned_at = now(), accepted_at = NULL, respond_by = $3,
       in_pool = false, overdue_warned_at = NULL, offer_reminded_at = NULL, updated_at = now() WHERE id = $1`,
    [requestId, t.id, deadline],
  );
  const skipped = loads.filter((x) => x.assignedThisMonth >= x.capacity).map((x) => x.name);
  let note = `${crisis ? "URGENT. " : ""}Offered automatically to ${t.name} (new client ${t.assignedThisMonth + 1} of ${t.capacity} this month), waiting for them to accept.`;
  if (declinedBy.length) note += ` (${declinedBy.length} ${declinedBy.length === 1 ? "counsellor" : "counsellors"} passed on it before.)`;
  if (t.assignedThisMonth >= t.capacity) note += " Everyone was full, so this crisis case goes over their limit.";
  else if (skipped.length) note += ` Skipped because full: ${skipped.join(", ")}.`;
  if (!choice.languageMatch)
    note += ` Check language: everyone who works in ${language} is full this month, and ${t.name} isn't listed for ${language}.`;
  await client.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [requestId, note]);
  // Keep the in-memory counts current so a batch spreads cases out correctly.
  t.assignedThisMonth++;
  t.lastAssignedAt = new Date();
  return { requestId, therapist: t, languageMatch: choice.languageMatch, crisis, respondBy: deadline };
}

// Runs fn under a lock so two requests arriving together can't both take someone's last place.
async function withAssignLock<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('eap-auto-assign'))");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Assigns a new request, or leaves a note that it's waiting for a free place. */
export function autoAssign(requestId: string, language: string, crisis: boolean): Promise<Assignment | null> {
  return withAssignLock(async (client) =>
    assignOne(client, await therapistLoads(client), requestId, language, crisis, [], true),
  );
}

/**
 * After a decline or an unanswered offer: offers the client straight away to the next available
 * counsellor (never one who already declined them). If nobody is available the client waits in
 * the pool, marked so, and is offered as soon as someone is. Private clients aren't offered
 * automatically: they go back to the coordinator to assign.
 */
export function offerToNext(requestId: string): Promise<Assignment | null> {
  return withAssignLock(async (client) => {
    const { rows } = await client.query<{ language: string; crisis: boolean; declined_by: string[]; kind: string }>(
      `SELECT language, crisis, declined_by, kind FROM support_requests
       WHERE id = $1 AND assigned_to IS NULL AND status = 'new'`,
      [requestId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    if (r.kind === "private") {
      await client.query("UPDATE support_requests SET in_pool = true WHERE id = $1", [requestId]);
      await client.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
        requestId,
        "Private client: back with the coordinator to assign a counsellor.",
      ]);
      return null;
    }
    const a = await assignOne(client, await therapistLoads(client), requestId, r.language, r.crisis, r.declined_by, false);
    if (!a) {
      await client.query("UPDATE support_requests SET in_pool = true WHERE id = $1", [requestId]);
      await client.query("INSERT INTO request_notes (request_id, body) VALUES ($1, $2)", [
        requestId,
        "Nobody else is available right now. Waiting in the pool: it will be offered as soon as someone is, or the coordinator can assign it.",
      ]);
    }
    return a;
  });
}

/**
 * Offers every EAP client still waiting for a counsellor, oldest (and crisis) first, as places open:
 * a new month, a raised limit, someone back from being away or newly signed up.
 */
export function assignWaiting(): Promise<Assignment[]> {
  return withAssignLock(async (client) => {
    const { rows } = await client.query<{ id: string; language: string; crisis: boolean; declined_by: string[] }>(
      `SELECT id, language, crisis, declined_by FROM support_requests
       WHERE assigned_to IS NULL AND status = 'new' AND kind = 'eap'
       ORDER BY crisis DESC, created_at`,
    );
    if (!rows.length) return [];
    const loads = await therapistLoads(client);
    const done: Assignment[] = [];
    for (const r of rows) {
      const a = await assignOne(client, loads, r.id, r.language, r.crisis, r.declined_by, false);
      if (a) done.push(a);
    }
    return done;
  });
}

/** assignWaiting, then tells each therapist about their new client. */
export async function assignWaitingAndNotify(): Promise<Assignment[]> {
  const done = await assignWaiting();
  const sent = await Promise.allSettled(
    done.map((a) => sendEmail(therapistAlert(a.therapist.email, a.therapist.name, a.requestId, a.crisis, a.respondBy))),
  );
  for (const s of sent) if (s.status === "rejected") console.error("EAP email failed:", s.reason);
  return done;
}
