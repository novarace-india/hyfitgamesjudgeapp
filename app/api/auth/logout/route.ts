import { currentUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";
import { parseCookies, tokenHash } from "../../../../lib/security";

export async function POST(request: Request) {
  const token = parseCookies(request).get("hyfit_session");
  const user = await currentUser(request);
  if (token) await query("UPDATE sessions SET revoked_at=now() WHERE token_hash=$1", [tokenHash(token)]);
  if (user) await query(`INSERT INTO audit_events(actor_id,event_id,action,entity_type) VALUES($1,$2,'logout','session')`, [user.id, user.eventId]);
  return Response.json({ ok: true }, { headers: { "set-cookie": "hyfit_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" } });
}
