import { audit, requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "readonly"]);
  if ("error" in auth) return auth.error;
  const result = await query(
    `SELECT s.id,s.code,s.name,s.stage_type AS "stageType",s.enabled,s.created_at AS "createdAt",
      COALESCE(json_agg(json_build_object(
        'assignmentId',a.id,'volunteerId',u.id,'staffId',u.staff_id,'name',u.name,
        'assignedAt',a.assigned_at
      )) FILTER(WHERE a.id IS NOT NULL),'[]') AS volunteers
      FROM checkin_stations s
      LEFT JOIN checkin_station_assignments a ON a.station_id=s.id AND a.released_at IS NULL
      LEFT JOIN users u ON u.id=a.volunteer_id
      WHERE s.event_id=$1 GROUP BY s.id ORDER BY s.enabled DESC,s.code`,
    [auth.user.eventId],
  );
  return Response.json({ stations: result.rows });
}

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  const code = String(body.code ?? "").trim().toUpperCase();
  const name = String(body.name ?? "").trim();
  const stageType = String(body.stageType ?? "");
  if (!/^[A-Z0-9_-]{1,20}$/.test(code) || !name || name.length > 100 ||
      !["STAGE_1_WRISTBAND", "STAGE_2_TRANSPONDER"].includes(stageType)) {
    return Response.json({ error: "Counter code, name, and valid stage are required" }, { status: 400 });
  }
  try {
    const result = await query<{ id: string }>(
      `INSERT INTO checkin_stations(event_id,code,name,stage_type,created_by)
       VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [auth.user.eventId, code, name, stageType, auth.user.id],
    );
    await audit(auth.user.id, auth.user.eventId, "checkin_station.create", "checkin_station", result.rows[0].id, { code, name, stageType });
    return Response.json({ id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return Response.json({ error: "Counter code already exists" }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  const id = String(body.id ?? "");
  const stageType = body.stageType == null ? null : String(body.stageType);
  if (!id || (body.enabled == null && !stageType) ||
      (body.enabled != null && typeof body.enabled !== "boolean") ||
      (stageType && !["STAGE_1_WRISTBAND", "STAGE_2_TRANSPONDER"].includes(stageType))) {
    return Response.json({ error: "Counter and a valid change are required" }, { status: 400 });
  }
  if (stageType) {
    const active = await query(
      `SELECT 1 FROM checkin_station_assignments WHERE station_id=$1 AND event_id=$2 AND released_at IS NULL LIMIT 1`,
      [id, auth.user.eventId],
    );
    if (active.rowCount) return Response.json({ error: "Release active volunteers before changing the counter stage" }, { status: 409 });
  }
  const result = await query(
    `UPDATE checkin_stations SET enabled=COALESCE($3,enabled),stage_type=COALESCE($4,stage_type),updated_at=now()
     WHERE id=$1 AND event_id=$2 RETURNING code,name`,
    [id, auth.user.eventId, body.enabled ?? null, stageType],
  );
  if (!result.rowCount) return Response.json({ error: "Counter not found" }, { status: 404 });
  await audit(auth.user.id, auth.user.eventId, "checkin_station.update", "checkin_station", id, { enabled: body.enabled, stageType });
  return Response.json({ ok: true });
}
