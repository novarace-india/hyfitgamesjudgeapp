import { requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "checkin"]);
  if ("error" in auth) return auth.error;
  const transactionId = new URL(request.url).searchParams.get("transactionId") ?? "";
  const result = await query(
    `SELECT c.transaction_id AS "transactionId",c.state,c.verified_at AS "acceptedAt",
      c.station_code_snapshot AS "stationCode",c.station_name_snapshot AS "stationName",
      count(o.*)::int AS total,
      count(*) FILTER(WHERE o.state='confirmed')::int AS confirmed,
      count(*) FILTER(WHERE o.state='conflict')::int AS conflicts
     FROM checkins c
     LEFT JOIN outbox_operations o ON o.operation_key LIKE 'checkin:'||c.transaction_id||':%'
     WHERE c.transaction_id=$1 AND c.event_id=$2 AND c.volunteer_id=$3
     GROUP BY c.id`,
    [transactionId, auth.user.eventId, auth.user.id],
  );
  return result.rows[0]
    ? Response.json({ checkin: result.rows[0] })
    : Response.json({ error: "Check-in transaction not found" }, { status: 404 });
}
