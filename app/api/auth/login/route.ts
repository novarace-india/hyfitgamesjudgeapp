import { query } from "../../../../lib/db";
import { newSessionToken, tokenHash, verifyPin } from "../../../../lib/security";

type LoginBody = { staffId?: unknown; pin?: unknown; deviceLabel?: unknown };

export async function POST(request: Request) {
  let body: LoginBody;
  try { body = await request.json() as LoginBody; } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const staffId = String(body.staffId ?? "").trim().toUpperCase();
  const pin = String(body.pin ?? "").trim();
  if (!staffId || !/^\d{4,8}$/.test(pin)) return Response.json({ error: "Enter a valid staff ID and PIN" }, { status: 400 });

  const found = await query<{ id: string; staffId: string; name: string; pinHash: string; role: string; eventId: string | null }>(
    `SELECT id,staff_id AS "staffId",name,pin_hash AS "pinHash",role,event_id AS "eventId"
       FROM users WHERE staff_id=$1 AND enabled=true`,
    [staffId],
  );
  const user = found.rows[0];
  if (!user || !verifyPin(pin, user.pinHash)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return Response.json({ error: "Staff ID or PIN is incorrect" }, { status: 401 });
  }

  const token = newSessionToken();
  await query(
    `INSERT INTO sessions(user_id,token_hash,device_label,ip_address,expires_at)
     VALUES($1,$2,$3,$4,now()+interval '12 hours')`,
    [user.id, tokenHash(token), String(body.deviceLabel ?? "").slice(0, 120), request.headers.get("x-forwarded-for") ?? ""],
  );
  await query(`INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id) VALUES($1,$2,'login','session',$3)`, [user.id, user.eventId, tokenHash(token).slice(0, 12)]);

  return Response.json(
    { user: { id: user.id, staffId: user.staffId, name: user.name, role: user.role, eventId: user.eventId } },
    { headers: { "set-cookie": `hyfit_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` } },
  );
}
