import { audit, requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "readonly"]);
  if ("error" in auth) return auth.error;
  const result = await query(
    `SELECT x.id,x.reason,x.note,x.state,x.created_at AS "createdAt",
      x.resolution_note AS "resolutionNote",x.resolved_at AS "resolvedAt",
      p.bib,p.name,s.code AS "stationCode",u.staff_id AS "volunteerStaffId",u.name AS "volunteerName"
     FROM checkin_identity_exceptions x
     JOIN participants p ON p.id=x.participant_id
     JOIN checkin_stations s ON s.id=x.station_id
     JOIN users u ON u.id=x.volunteer_id
     WHERE x.event_id=$1 ORDER BY (x.state='open') DESC,x.created_at DESC LIMIT 100`,
    [auth.user.eventId],
  );
  return Response.json({ exceptions: result.rows });
}

export async function PATCH(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  const id = String(body.id ?? "");
  const state = String(body.state ?? "");
  const note = String(body.note ?? "").trim();
  if (!id || !["overridden", "rejected"].includes(state) || !note) {
    return Response.json({ error: "Exception, decision, and resolution note are required" }, { status: 400 });
  }
  const result = await query(
    `UPDATE checkin_identity_exceptions SET state=$3,resolved_by=$4,resolution_note=$5,resolved_at=now()
     WHERE id=$1 AND event_id=$2 AND state='open' RETURNING id`,
    [id,auth.user.eventId,state,auth.user.id,note],
  );
  if (!result.rowCount) return Response.json({ error: "Open exception not found" }, { status: 404 });
  await audit(auth.user.id,auth.user.eventId,"checkin.identity_exception.resolve","checkin_identity_exception",id,{ state,note });
  return Response.json({ ok: true });
}
