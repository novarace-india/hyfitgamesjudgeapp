import { requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";
import { isDoublesContestId } from "../../../doubles";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","judge"]);
  if ("error" in auth) return auth.error;
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ error: "Wristband code is required" }, { status: 400 });
  const result = await query(
    `SELECT p.id,p.bib,p.name,p.category,p.contest_id AS "contestId",p.wave,p.club,
      CASE WHEN EXISTS(
        SELECT 1 FROM race_session_participants rp
        WHERE rp.participant_id=p.id AND rp.event_id=p.event_id AND rp.released_at IS NULL
      ) THEN 'On course' ELSE 'Ready' END AS status,
      EXISTS(
        SELECT 1 FROM checkin_stage_records c WHERE c.event_id=p.event_id
          AND c.participant_id=p.id AND c.stage_type='STAGE_2_TRANSPONDER' AND c.state<>'reversed'
      ) AS "stage2Ready"
      FROM asset_assignments a JOIN participants p ON p.id=a.participant_id
      WHERE a.event_id=$1 AND a.asset_type='wristband' AND a.asset_code=$2 AND a.active=true`,
    [auth.user.eventId, code],
  );
  const participant = result.rows[0];
  if (!participant) return Response.json({ error: "Wristband is not assigned in this event" }, { status: 404 });
  let teammate = null;
  let teamWarning = null;
  if (isDoublesContestId(participant.contestId)) {
    if (!String(participant.club ?? "").trim()) {
      teamWarning = "Doubles team has no club identifier";
    } else {
      const teammates = await query(
        `SELECT p.id,p.bib,p.name,p.category,p.contest_id AS "contestId",p.wave,p.club,
          CASE WHEN EXISTS(
            SELECT 1 FROM race_session_participants rp
            WHERE rp.participant_id=p.id AND rp.event_id=p.event_id AND rp.released_at IS NULL
          ) THEN 'On course' ELSE 'Ready' END AS status,
          EXISTS(
            SELECT 1 FROM checkin_stage_records c WHERE c.event_id=p.event_id
              AND c.participant_id=p.id AND c.stage_type='STAGE_2_TRANSPONDER' AND c.state<>'reversed'
          ) AS "stage2Ready"
         FROM participants p
         WHERE p.event_id=$1 AND p.id<>$2 AND p.contest_id=$3
           AND lower(regexp_replace(trim(p.club),'\\s+',' ','g'))=
             lower(regexp_replace(trim($4),'\\s+',' ','g'))
         ORDER BY p.bib`,
        [auth.user.eventId, participant.id, participant.contestId, participant.club],
      );
      if (teammates.rows.length === 1) teammate = teammates.rows[0];
      else teamWarning = teammates.rows.length
        ? "More than two athletes share this Doubles club"
        : "Doubles teammate was not found";
    }
  }
  return Response.json({
    participant,
    teammate,
    teamWarning,
    scannedWristbandCode: code,
  });
}
