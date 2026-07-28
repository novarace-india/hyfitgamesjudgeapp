import { requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","readonly"]);
  if ("error" in auth) return auth.error;
  const eventId = new URL(request.url).searchParams.get("eventId") ?? auth.user.eventId;
  const result = await query(
    `SELECT e.id,e.name,e.venue,e.status,e.config_version AS "configVersion",
      (SELECT count(*)::int FROM participants p WHERE p.event_id=e.id) AS participants,
      (SELECT count(*)::int FROM participants p WHERE p.event_id=e.id AND p.checkin_state<>'not_checked_in') AS "checkedIn",
      (SELECT count(*)::int FROM race_sessions r WHERE r.event_id=e.id AND r.state='active') AS "onCourse",
      (SELECT count(*)::int FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.event_id=e.id AND u.role='judge' AND s.revoked_at IS NULL AND s.expires_at>now() AND s.last_seen_at>now()-interval '5 minutes') AS "activeJudges",
      (SELECT count(*)::int FROM outbox_operations o WHERE o.event_id=e.id AND o.state IN ('pending','processing','failed')) AS "pendingSync",
      (SELECT count(*)::int FROM outbox_operations o WHERE o.event_id=e.id AND o.state='conflict') AS conflicts
      FROM events e WHERE e.id=$1`,
    [eventId],
  );
  return Response.json({ overview: result.rows[0] ?? null });
}
