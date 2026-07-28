import { requireUser } from "../../../../lib/auth.server";
import { transaction } from "../../../../lib/db";

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  const volunteerId = String(body.volunteerId ?? "");
  const stationId = String(body.stationId ?? "");
  const reason = String(body.reason ?? "Admin counter assignment").trim().slice(0, 300);
  if (!volunteerId || !stationId) {
    return Response.json({ error: "Volunteer and counter are required" }, { status: 400 });
  }
  try {
    const result = await transaction(async (client) => {
      const valid = await client.query(
        `SELECT u.id,s.code,s.name FROM users u CROSS JOIN checkin_stations s
         WHERE u.id=$1 AND u.event_id=$3 AND u.role='checkin' AND u.enabled=true
           AND s.id=$2 AND s.event_id=$3 AND s.enabled=true`,
        [volunteerId, stationId, auth.user.eventId],
      );
      if (!valid.rowCount) throw Object.assign(new Error("Enabled check-in volunteer and counter are required"), { status: 409 });
      await client.query(
        `UPDATE checkin_station_assignments SET released_at=now(),release_reason=$4
         WHERE event_id=$1 AND volunteer_id=$2 AND released_at IS NULL AND station_id<>$3`,
        [auth.user.eventId, volunteerId, stationId, reason],
      );
      const assignment = await client.query<{ id: string }>(
        `INSERT INTO checkin_station_assignments(event_id,station_id,volunteer_id,assigned_by)
         SELECT $1,$2,$3,$4 WHERE NOT EXISTS(
           SELECT 1 FROM checkin_station_assignments
           WHERE event_id=$1 AND volunteer_id=$3 AND station_id=$2 AND released_at IS NULL
         ) RETURNING id`,
        [auth.user.eventId, stationId, volunteerId, auth.user.id],
      );
      const assignmentId = assignment.rows[0]?.id ?? (await client.query<{ id: string }>(
        `SELECT id FROM checkin_station_assignments
         WHERE event_id=$1 AND volunteer_id=$2 AND station_id=$3 AND released_at IS NULL`,
        [auth.user.eventId, volunteerId, stationId],
      )).rows[0].id;
      await client.query(
        `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'checkin_station.assign','checkin_station_assignment',$3,$4::jsonb)`,
        [auth.user.id, auth.user.eventId, assignmentId, JSON.stringify({ volunteerId, stationId, reason })],
      );
      return { assignmentId };
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: (error as { status?: number }).status ?? 500 });
  }
}
