// Group support: groups, their members and attendance. Coordinators and admins see every group;
// counsellors see the groups they lead.
import { isManager, type Staff } from "./auth";
import { pool } from "./db";

export const GROUP_KINDS = ["Group support", "ADHD group support", "Anxiety and depression group support"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export type Group = {
  id: string;
  name: string;
  kind: string;
  counsellor_id: string | null;
  counsellor: string | null;
  details: string;
  active: boolean;
  members: number;
  sessions: number;
  next_session: Date | null;
};

export type Member = {
  id: string;
  first_name: string;
  surname: string;
  email: string;
  consent_signed_on: string | null; // YYYY-MM-DD
  attended: number;
};

export type GroupSession = { id: string; starts_at: Date; present: string[] }; // member ids

export async function listGroups(staff: Staff): Promise<Group[]> {
  const { rows } = await pool.query<Group>(
    `SELECT g.id, g.name, g.kind, g.counsellor_id, s.name AS counsellor, g.details, g.active,
       (SELECT count(*)::int FROM group_members WHERE group_id = g.id) AS members,
       (SELECT count(*)::int FROM group_sessions WHERE group_id = g.id) AS sessions,
       (SELECT min(starts_at) FROM group_sessions WHERE group_id = g.id AND starts_at > now()) AS next_session
     FROM support_groups g LEFT JOIN staff s ON s.id = g.counsellor_id
     WHERE $1::uuid IS NULL OR g.counsellor_id = $1
     ORDER BY g.active DESC, g.kind, g.name`,
    [isManager(staff) ? null : staff.id],
  );
  return rows;
}

/** The group, if this staff member may see it. */
export async function getGroup(id: string, staff: Staff): Promise<Group | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const groups = await listGroups(staff);
  return groups.find((g) => g.id === id) ?? null;
}

export async function groupMembers(groupId: string): Promise<Member[]> {
  const { rows } = await pool.query<Member>(
    `SELECT m.id, m.first_name, m.surname, m.email, to_char(m.consent_signed_on, 'YYYY-MM-DD') AS consent_signed_on,
       (SELECT count(*)::int FROM group_attendance a WHERE a.member_id = m.id) AS attended
     FROM group_members m WHERE m.group_id = $1 ORDER BY m.surname, m.first_name`,
    [groupId],
  );
  return rows;
}

export async function groupSessions(groupId: string): Promise<GroupSession[]> {
  const { rows } = await pool.query<GroupSession>(
    `SELECT gs.id, gs.starts_at,
       COALESCE(array_agg(a.member_id::text) FILTER (WHERE a.member_id IS NOT NULL), '{}') AS present
     FROM group_sessions gs LEFT JOIN group_attendance a ON a.session_id = gs.id
     WHERE gs.group_id = $1 GROUP BY gs.id ORDER BY gs.starts_at`,
    [groupId],
  );
  return rows;
}
