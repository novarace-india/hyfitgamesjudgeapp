import { audit, requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";
import { hashPin, type AppRole } from "../../../../lib/security";

const roles: AppRole[] = ["super_admin","event_admin","checkin","judge","readonly"];

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","readonly"]);
  if ("error" in auth) return auth.error;
  const users = await query(
    `SELECT id,staff_id AS "staffId",name,role,event_id AS "eventId",station_number AS "stationNumber",enabled,created_at AS "createdAt"
       FROM users ORDER BY enabled DESC,role,name`,
  );
  return Response.json({ users: users.rows });
}

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  const staffId = String(body.staffId ?? "").trim().toUpperCase();
  const name = String(body.name ?? "").trim();
  const pin = String(body.pin ?? "");
  const role = String(body.role ?? "") as AppRole;
  if (!staffId || !name || !/^\d{4,8}$/.test(pin) || !roles.includes(role)) {
    return Response.json({ error: "Staff ID, name, 4–8 digit PIN, and valid role are required" }, { status: 400 });
  }
  try {
    const result = await query<{ id: string }>(
      `INSERT INTO users(staff_id,name,pin_hash,role,event_id,station_number)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [staffId, name, hashPin(pin), role, body.eventId || auth.user.eventId, body.stationNumber || null],
    );
    await audit(auth.user.id, String(body.eventId || auth.user.eventId || ""), "user.create", "user", result.rows[0].id, { staffId, name, role });
    return Response.json({ id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return Response.json({ error: "Staff ID already exists" }, { status: 409 });
    throw error;
  }
}

export async function PATCH(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  await query(
    `UPDATE users SET enabled=COALESCE($2,enabled),station_number=COALESCE($3,station_number),
      pin_hash=CASE WHEN $4::text IS NULL THEN pin_hash ELSE $4 END,updated_at=now() WHERE id=$1`,
    [body.id, typeof body.enabled === "boolean" ? body.enabled : null, body.stationNumber || null, body.pin ? hashPin(String(body.pin)) : null],
  );
  await audit(auth.user.id, auth.user.eventId, "user.update", "user", String(body.id), { enabled: body.enabled, stationNumber: body.stationNumber, pinReset: Boolean(body.pin) });
  return Response.json({ ok: true });
}
