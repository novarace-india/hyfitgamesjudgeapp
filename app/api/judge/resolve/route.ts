import { requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","judge"]);
  if ("error" in auth) return auth.error;
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ error: "Wristband code is required" }, { status: 400 });
  const result = await query(
    `SELECT p.id,p.bib,p.name,p.category,p.wave,
      CASE WHEN EXISTS(SELECT 1 FROM race_sessions r WHERE r.participant_id=p.id AND r.state='active') THEN 'On course' ELSE 'Ready' END AS status
      FROM asset_assignments a JOIN participants p ON p.id=a.participant_id
      WHERE a.event_id=$1 AND a.asset_type='wristband' AND a.asset_code=$2 AND a.active=true`,
    [auth.user.eventId, code],
  );
  return result.rows[0] ? Response.json({ participant: result.rows[0] }) : Response.json({ error: "Wristband is not assigned in this event" }, { status: 404 });
}
