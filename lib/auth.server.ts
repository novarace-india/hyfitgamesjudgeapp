import { query } from "./db.ts";
import { parseCookies, tokenHash, type AppRole } from "./security.ts";

export type AppUser = {
  id: string;
  staffId: string;
  name: string;
  role: AppRole;
  eventId: string | null;
  sessionId: string;
  deviceLabel: string;
  ipAddress: string;
};

export async function currentUser(request: Request): Promise<AppUser | null> {
  const token = parseCookies(request).get("hyfit_session");
  if (!token) return null;
  const result = await query<AppUser>(
    `SELECT u.id, u.staff_id AS "staffId", u.name, u.role, u.event_id AS "eventId",
      s.id AS "sessionId",COALESCE(s.device_label,'') AS "deviceLabel",
      COALESCE(s.ip_address,'') AS "ipAddress"
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.enabled=true`,
    [tokenHash(token)],
  );
  if (!result.rows[0]) return null;
  await query("UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1", [tokenHash(token)]);
  return result.rows[0];
}

export async function requireUser(request: Request, roles?: AppRole[]) {
  const user = await currentUser(request);
  if (!user) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) } as const;
  if (roles && !roles.includes(user.role)) {
    return { error: Response.json({ error: "Not authorized" }, { status: 403 }) } as const;
  }
  return { user } as const;
}

export function audit(
  actorId: string,
  eventId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: unknown,
) {
  return query(
    `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [actorId, eventId, action, entityType, entityId, JSON.stringify(details ?? {})],
  );
}
