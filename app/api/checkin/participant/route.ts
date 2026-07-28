import { requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","checkin"]);
  if ("error" in auth) return auth.error;
  const bib = new URL(request.url).searchParams.get("bib")?.trim() ?? "";
  if (!/^\d+$/.test(bib)) return Response.json({ error: "A numeric BIB is required" }, { status: 400 });
  const result = await query(
    `SELECT p.id,p.bib,p.name,p.category,p.wave,p.checkin_state AS "checkinState",
      max(a.asset_code) FILTER(WHERE a.asset_type='wristband' AND a.active) AS "wristbandCode",
      max(a.asset_code) FILTER(WHERE a.asset_type='transponder1' AND a.active) AS "transponderCode"
      FROM participants p LEFT JOIN asset_assignments a ON a.participant_id=p.id
      WHERE p.event_id=$1 AND p.bib=$2 GROUP BY p.id`,
    [auth.user.eventId, bib],
  );
  return result.rows[0] ? Response.json({ participant: result.rows[0] }) : Response.json({ error: `BIB ${bib} was not found in the active event` }, { status: 404 });
}
