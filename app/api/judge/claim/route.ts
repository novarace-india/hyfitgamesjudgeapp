import { requireUser } from "../../../../lib/auth.server";
import { transaction } from "../../../../lib/db";
import { isDoublesContestId, normalizedTeamClub, sameDoublesTeam } from "../../../doubles";

type ClaimBody = {
  participantId?: string;
  wristbandCodes?: unknown;
  readinessConfirmed?: unknown;
};

type ClaimParticipant = {
  id: string;
  bib: string;
  name: string;
  category: string;
  contestId: string;
  club: string;
  wristbandCode: string;
  transponderCode: string;
  stage2Ready: boolean;
};

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","judge"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as ClaimBody;
  const wristbandCodes = Array.isArray(body.wristbandCodes)
    ? body.wristbandCodes.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const doublesClaim = wristbandCodes.length > 0;
  if (!doublesClaim && !body.participantId) {
    return Response.json({ error: "Participant is required" }, { status: 400 });
  }
  if (doublesClaim && (wristbandCodes.length !== 2 || new Set(wristbandCodes).size !== 2)) {
    return Response.json({ error: "Scan two different partner wristbands" }, { status: 400 });
  }
  if (doublesClaim && body.readinessConfirmed !== true) {
    return Response.json({ error: "Confirm that both athletes are present and ready" }, { status: 400 });
  }

  try {
    const session = await transaction(async (client) => {
      const event = await client.query<{ config_version: number }>(
        "SELECT config_version FROM events WHERE id=$1",
        [auth.user.eventId],
      );
      let participants: ClaimParticipant[];

      if (doublesClaim) {
        const resolved = await client.query<ClaimParticipant>(
          `SELECT p.id,p.bib,p.name,p.category,p.contest_id AS "contestId",p.club,
            max(a.asset_code) FILTER(WHERE a.asset_type='wristband' AND a.active) AS "wristbandCode",
            max(a.asset_code) FILTER(WHERE a.asset_type='transponder1' AND a.active) AS "transponderCode",
            EXISTS(
              SELECT 1 FROM checkin_stage_records c
              WHERE c.event_id=p.event_id AND c.participant_id=p.id
                AND c.stage_type='STAGE_2_TRANSPONDER' AND c.state<>'reversed'
            ) AS "stage2Ready"
           FROM participants p
           JOIN asset_assignments scanned ON scanned.participant_id=p.id
             AND scanned.event_id=p.event_id AND scanned.asset_type='wristband'
             AND scanned.active AND scanned.asset_code=ANY($2::text[])
           LEFT JOIN asset_assignments a ON a.participant_id=p.id AND a.event_id=p.event_id
           WHERE p.event_id=$1
           GROUP BY p.id
           ORDER BY array_position($2::text[],max(scanned.asset_code))`,
          [auth.user.eventId, wristbandCodes],
        );
        participants = resolved.rows;
        if (participants.length !== 2) {
          throw Object.assign(new Error("Both active partner wristbands must be scanned"), { status: 409 });
        }
        const [first, second] = participants;
        if (!sameDoublesTeam(first, second)) {
          throw Object.assign(new Error("These wristbands do not belong to the same registered Doubles team"), { status: 409 });
        }
        if (!isDoublesContestId(first.contestId)) {
          throw Object.assign(new Error("Two-athlete pairing is available only for Doubles contests"), { status: 409 });
        }
        const teamCount = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM participants
           WHERE event_id=$1 AND contest_id=$2 AND lower(regexp_replace(trim(club),'\\s+',' ','g'))=$3`,
          [auth.user.eventId, first.contestId, normalizedTeamClub(first.club)],
        );
        if (Number(teamCount.rows[0]?.count) !== 2) {
          throw Object.assign(new Error("Doubles team data needs Event Control attention"), { status: 409 });
        }
        const notReady = participants.find((participant) =>
          !participant.stage2Ready || !participant.wristbandCode || !participant.transponderCode);
        if (notReady) {
          throw Object.assign(
            new Error(`${notReady.name} must complete Stage 2 before the team can start`),
            { status: 409 },
          );
        }
      } else {
        const resolved = await client.query<ClaimParticipant>(
          `SELECT p.id,p.bib,p.name,p.category,p.contest_id AS "contestId",p.club,
            COALESCE(max(a.asset_code) FILTER(WHERE a.asset_type='wristband' AND a.active),'') AS "wristbandCode",
            COALESCE(max(a.asset_code) FILTER(WHERE a.asset_type='transponder1' AND a.active),'') AS "transponderCode",
            false AS "stage2Ready"
           FROM participants p LEFT JOIN asset_assignments a ON a.participant_id=p.id AND a.event_id=p.event_id
           WHERE p.event_id=$1 AND p.id=$2 GROUP BY p.id`,
          [auth.user.eventId, body.participantId],
        );
        participants = resolved.rows;
        if (!participants[0]) throw Object.assign(new Error("Participant not found"), { status: 404 });
        if (isDoublesContestId(participants[0].contestId)) {
          throw Object.assign(new Error("Scan both partner wristbands to claim a Doubles team"), { status: 409 });
        }
      }

      const participantIds = participants.map((participant) => participant.id).sort();
      for (const participantId of participantIds) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`race-participant:${participantId}`]);
      }
      const active = await client.query(
        `SELECT 1 FROM race_session_participants
         WHERE event_id=$1 AND participant_id=ANY($2::uuid[]) AND released_at IS NULL`,
        [auth.user.eventId, participantIds],
      );
      if (active.rowCount) {
        throw Object.assign(new Error("One of these athletes is already assigned to an active judge"), { status: 409 });
      }

      const primary = participants[0];
      const created = await client.query<{ id: string }>(
        `INSERT INTO race_sessions(
          event_id,participant_id,judge_id,config_version,race_mode,
          team_club_snapshot,team_contest_id_snapshot
         ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          auth.user.eventId, primary.id, auth.user.id, event.rows[0]?.config_version ?? 1,
          doublesClaim ? "doubles" : "single",
          doublesClaim ? primary.club : "",
          doublesClaim ? primary.contestId : "",
        ],
      );
      for (const [index, participant] of participants.entries()) {
        await client.query(
          `INSERT INTO race_session_participants(
            race_session_id,event_id,participant_id,display_order,
            participant_bib_snapshot,participant_name_snapshot,contest_id_snapshot,
            contest_snapshot,club_snapshot,wristband_code_snapshot,transponder_code_snapshot
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            created.rows[0].id,auth.user.eventId,participant.id,index + 1,
            participant.bib,participant.name,participant.contestId,participant.category,
            participant.club,participant.wristbandCode,participant.transponderCode,
          ],
        );
      }
      await client.query(
        `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'race.claim','race_session',$3,$4::jsonb)`,
        [
          auth.user.id,auth.user.eventId,created.rows[0].id,
          JSON.stringify({
            mode: doublesClaim ? "doubles" : "single",
            participants: participants.map(({ id,bib,name }) => ({ id,bib,name })),
            readinessConfirmed: doublesClaim,
          }),
        ],
      );
      return {
        id: created.rows[0].id,
        mode: doublesClaim ? "doubles" : "single",
        participants: participants.map(({ id,bib,name,category,contestId,club }) =>
          ({ id,bib,name,category,contestId,club })),
      };
    });
    return Response.json({ session }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return Response.json({ error: "Athlete is already assigned to another active judge" }, { status: 409 });
    }
    const status = (error as { status?: number }).status ?? 500;
    return Response.json({
      error: status === 500 ? "Race assignment could not be created" : (error as Error).message,
    }, { status });
  }
}
