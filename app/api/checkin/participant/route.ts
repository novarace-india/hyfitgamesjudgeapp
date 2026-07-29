import { requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";
import { isDoublesContest, teamWarning } from "../../../../lib/checkin-stage";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","checkin"]);
  if ("error" in auth) return auth.error;
  const bib = new URL(request.url).searchParams.get("bib")?.trim() ?? "";
  if (!/^\d+$/.test(bib)) return Response.json({ error: "A numeric BIB is required" }, { status: 400 });
  const result = await query<{
    id: string; bib: string; name: string; category: string; wave: string;
    gender: string; dateOfBirth: string; club: string; checkinState: string;
    wristbandCode?: string; transponderCode?: string;
  }>(
    `SELECT p.id,p.bib,p.name,p.category,p.wave,p.gender,
      COALESCE(to_char(p.date_of_birth,'YYYY-MM-DD'),'') AS "dateOfBirth",
      p.club,p.checkin_state AS "checkinState",
      max(a.asset_code) FILTER(WHERE a.asset_type='wristband' AND a.active) AS "wristbandCode",
      max(a.asset_code) FILTER(WHERE a.asset_type='transponder1' AND a.active) AS "transponderCode"
      FROM participants p LEFT JOIN asset_assignments a ON a.participant_id=p.id
      WHERE p.event_id=$1 AND p.bib=$2 GROUP BY p.id`,
    [auth.user.eventId, bib],
  );
  const participant = result.rows[0];
  if (!participant) return Response.json({ error: `BIB ${bib} was not found in the active event` }, { status: 404 });

  const stages = await query(
    `SELECT stage_type AS "stageType",state,completed_at AS "completedAt",
      station_code_snapshot AS "stationCode",station_name_snapshot AS "stationName",
      volunteer_name_snapshot AS "volunteerName",asset_code_snapshot AS "assetCode"
     FROM checkin_stage_records WHERE event_id=$1 AND participant_id=$2 AND state<>'reversed'`,
    [auth.user.eventId, participant.id],
  );
  const teammates = isDoublesContest(participant.category) && participant.club.trim()
    ? await query(
      `SELECT p.id,p.bib,p.name,p.gender,COALESCE(to_char(p.date_of_birth,'YYYY-MM-DD'),'') AS "dateOfBirth",
        p.category,p.wave,p.club,
        COALESCE(json_object_agg(r.stage_type,r.state) FILTER(WHERE r.id IS NOT NULL),'{}') AS stages
       FROM participants p LEFT JOIN checkin_stage_records r
         ON r.participant_id=p.id AND r.event_id=p.event_id AND r.state<>'reversed'
       WHERE p.event_id=$1 AND p.id<>$2 AND lower(p.club)=lower($3) AND lower(p.category)=lower($4)
       GROUP BY p.id ORDER BY p.bib`,
      [auth.user.eventId, participant.id, participant.club, participant.category],
    )
    : { rows: [] };

  return Response.json({
    participant,
    stages: Object.fromEntries(stages.rows.map((stage) => [stage.stageType, stage])),
    teammates: teammates.rows,
    teamWarning: teamWarning(participant, teammates.rows),
  });
}
