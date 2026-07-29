import { requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";

const reasons = new Set(["NO_GOVERNMENT_ID", "IDENTITY_MISMATCH", "PARTICIPANT_DATA_ISSUE", "EVIDENCE_CAPTURE_FAILED"]);

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "checkin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  const participantId = String(body.participantId ?? "");
  const reason = String(body.reason ?? "");
  const note = String(body.note ?? "").trim().slice(0, 500);
  if (!participantId || !reasons.has(reason)) {
    return Response.json({ error: "Participant and a valid Help Desk reason are required" }, { status: 400 });
  }
  const station = await query(
    `SELECT s.id,s.stage_type AS "stageType" FROM checkin_station_assignments a
     JOIN checkin_stations s ON s.id=a.station_id
     WHERE a.event_id=$1 AND a.volunteer_id=$2 AND a.released_at IS NULL AND s.enabled=true`,
    [auth.user.eventId, auth.user.id],
  );
  if (station.rows[0]?.stageType !== "STAGE_1_WRISTBAND") {
    return Response.json({ error: "Identity exceptions can only be opened at Stage 1" }, { status: 403 });
  }
  const result = await query(
    `INSERT INTO checkin_identity_exceptions(event_id,participant_id,volunteer_id,station_id,reason,note)
     SELECT $1,p.id,$2,$3,$4,$5 FROM participants p WHERE p.id=$6 AND p.event_id=$1 RETURNING id,created_at AS "createdAt"`,
    [auth.user.eventId,auth.user.id,station.rows[0].id,reason,note,participantId],
  );
  if (!result.rowCount) return Response.json({ error: "Participant not found" }, { status: 404 });
  await query(
    `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
     VALUES($1,$2,'checkin.identity_exception','checkin_identity_exception',$3,$4::jsonb)`,
    [auth.user.id,auth.user.eventId,result.rows[0].id,JSON.stringify({ participantId,reason,note,stationId:station.rows[0].id })],
  );
  return Response.json(result.rows[0], { status: 201 });
}
