import { requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "checkin"]);
  if ("error" in auth) return auth.error;
  const result = await query(
    `SELECT s.id,s.code,s.name,a.id AS "assignmentId",a.assigned_at AS "assignedAt"
     FROM checkin_station_assignments a JOIN checkin_stations s ON s.id=a.station_id
     WHERE a.event_id=$1 AND a.volunteer_id=$2 AND a.released_at IS NULL AND s.enabled=true`,
    [auth.user.eventId, auth.user.id],
  );
  return Response.json({
    volunteer: { id: auth.user.id, staffId: auth.user.staffId, name: auth.user.name },
    station: result.rows[0] ?? null,
  });
}
