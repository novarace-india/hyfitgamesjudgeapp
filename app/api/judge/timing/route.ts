import { requireUser } from "../../../../lib/auth.server";
import { query, transaction } from "../../../../lib/db";
import type { PoolClient } from "pg";
import { colorSequence, type ColorKey } from "../../../cognitive-sequence";
import {
  cognitiveAdjustment,
  allowsBearCrawlPenalty,
  raceStage,
  validateStationOutcome,
  type StationOutcome,
} from "../../../race-format";
import { deliverOutboxOperation } from "../../penalties/route";

type TimingAction =
  | { action: "start"; bib: string; operationId: string; clientObservedAt?: string }
  | { action: "memorise_complete"; bib: string; operationId: string; clientObservedAt?: string }
  | { action: "complete_stage"; bib: string; operationId: string; stageId: string; outcome?: StationOutcome; penaltySeconds?: number; note?: string; clientObservedAt?: string }
  | { action: "complete_recall"; bib: string; operationId: string; response: ColorKey[]; tapObservedAt: string[]; clientObservedAt?: string }
  | { action: "finish"; bib: string; operationId: string; clientObservedAt?: string };

type ActiveRace = {
  id: string;
  eventId: string;
  participantId: string;
  bib: string;
  participantName: string;
  contestId: string;
  judgeId: string;
  currentStage: string;
  manualStartedAt: string | null;
  cognitiveRecallStartedAt: string | null;
  isOoc: boolean;
  state: string;
};

function numericBib(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function validOperationId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160;
}

async function raceSnapshot(eventId: string, judgeId: string, bib: string) {
  const session = await query<ActiveRace>(
    `SELECT r.id,r.event_id AS "eventId",r.participant_id AS "participantId",p.bib,
      p.name AS "participantName",p.contest_id AS "contestId",r.judge_id AS "judgeId",r.current_stage AS "currentStage",
      r.manual_started_at AS "manualStartedAt",
      r.cognitive_recall_started_at AS "cognitiveRecallStartedAt",
      r.is_ooc AS "isOoc",r.state
     FROM race_sessions r JOIN participants p ON p.id=r.participant_id
     WHERE r.event_id=$1 AND r.judge_id=$2 AND p.bib=$3
       AND r.state IN ('active','finished')
     ORDER BY r.started_at DESC LIMIT 1`,
    [eventId, judgeId, bib],
  );
  if (!session.rows[0]) return null;
  const splits = await query(
    `SELECT id,stage_id AS "stageId",stage_name AS "stageName",
      boundary_at AS "boundaryAt",cumulative_ms AS "cumulativeMs",
      segment_ms AS "segmentMs",revision_state AS "revisionState"
     FROM race_splits WHERE race_session_id=$1
     ORDER BY boundary_at,created_at`,
    [session.rows[0].id],
  );
  const outcomes = await query(
    `SELECT station_number AS "stationNumber",outcome,penalty_seconds AS "penaltySeconds",
      note,created_at AS "createdAt"
     FROM station_outcomes WHERE race_session_id=$1 ORDER BY created_at`,
    [session.rows[0].id],
  );
  const cognitive = await query(
    `SELECT response,correct_count AS "correctCount",percentage,
      penalty_seconds AS "penaltySeconds",bonus_seconds AS "bonusSeconds",
      recall_duration_ms AS "recallDurationMs"
     FROM cognitive_attempts WHERE race_session_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [session.rows[0].id],
  );
  return {
    session: session.rows[0],
    stage: raceStage(session.rows[0].currentStage),
    splits: splits.rows,
    outcomes: outcomes.rows,
    cognitive: cognitive.rows[0] ?? null,
  };
}

async function insertOutbox(
  client: PoolClient,
  actionKey: string,
  race: ActiveRace,
  fieldName: string,
  value: string | number,
) {
  const result = await client.query(
    `INSERT INTO outbox_operations(operation_key,event_id,participant_id,bib,field_name,value)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(operation_key) DO UPDATE SET operation_key=EXCLUDED.operation_key
     RETURNING id`,
    [`${actionKey}:rr:${fieldName}`, race.eventId, race.participantId, race.bib, fieldName, String(value)],
  );
  return result.rows[0].id;
}

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "judge"]);
  if ("error" in auth) return auth.error;
  const bib = new URL(request.url).searchParams.get("bib") ?? "";
  if (!numericBib(bib)) return Response.json({ error: "Numeric BIB is required" }, { status: 400 });
  const snapshot = await raceSnapshot(auth.user.eventId!, auth.user.id, bib);
  return snapshot
    ? Response.json(snapshot)
    : Response.json({ error: "Race session not found" }, { status: 404 });
}

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "judge"]);
  if ("error" in auth) return auth.error;

  let body: TimingAction;
  try {
    body = await request.json() as TimingAction;
  } catch {
    return Response.json({ error: "Invalid JSON request" }, { status: 400 });
  }
  if (!numericBib(body.bib) || !validOperationId(body.operationId)) {
    return Response.json({ error: "BIB and operation ID are required" }, { status: 400 });
  }

  const deliveryIds: string[] = [];
  try {
    await transaction(async (client) => {
      const raceResult = await client.query<ActiveRace>(
        `SELECT r.id,r.event_id AS "eventId",r.participant_id AS "participantId",p.bib,
          p.name AS "participantName",p.contest_id AS "contestId",r.judge_id AS "judgeId",r.current_stage AS "currentStage",
          r.manual_started_at AS "manualStartedAt",
          r.cognitive_recall_started_at AS "cognitiveRecallStartedAt",
          r.is_ooc AS "isOoc",r.state
         FROM race_sessions r JOIN participants p ON p.id=r.participant_id
         WHERE r.event_id=$1 AND r.judge_id=$2 AND p.bib=$3 AND r.state='active'
         FOR UPDATE OF r`,
        [auth.user.eventId, auth.user.id, body.bib],
      );
      const race = raceResult.rows[0];
      if (!race) throw Object.assign(new Error("Active race session not found"), { status: 409 });

      const duplicate = await client.query("SELECT 1 FROM race_splits WHERE operation_key=$1", [body.operationId]);
      if (duplicate.rowCount) return;

      const acceptedAt = new Date();
      const observedTime = body.clientObservedAt && !Number.isNaN(Date.parse(body.clientObservedAt))
        ? new Date(body.clientObservedAt)
        : null;
      const clientObservedAt = observedTime?.toISOString() ?? null;
      const boundaryAt = observedTime && Math.abs(acceptedAt.getTime() - observedTime.getTime()) <= 300_000
        ? observedTime
        : acceptedAt;
      const startedAt = race.manualStartedAt ? new Date(race.manualStartedAt) : boundaryAt;
      const previous = await client.query<{ boundary_at: string }>(
        `SELECT boundary_at FROM race_splits WHERE race_session_id=$1
         ORDER BY boundary_at DESC,created_at DESC LIMIT 1`,
        [race.id],
      );
      const previousAt = previous.rows[0] ? new Date(previous.rows[0].boundary_at) : startedAt;
      const cumulativeMs = Math.max(0, boundaryAt.getTime() - startedAt.getTime());
      const segmentMs = Math.max(0, boundaryAt.getTime() - previousAt.getTime());

      const addSplit = async (stageId: string, stageName: string) => {
        const result = await client.query<{ id: string }>(
          `INSERT INTO race_splits(
            race_session_id,event_id,participant_id,judge_id,operation_key,
            stage_id,stage_name,boundary_at,client_observed_at,cumulative_ms,segment_ms
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [race.id, race.eventId, race.participantId, race.judgeId, body.operationId,
            stageId, stageName, boundaryAt, clientObservedAt, cumulativeMs, segmentMs],
        );
        return result.rows[0].id;
      };

      if (body.action === "start") {
        if (race.currentStage !== "ready") throw Object.assign(new Error("Race has already started"), { status: 409 });
        await addSplit("race_start", "Show Colours");
        await client.query(
          `UPDATE race_sessions SET current_stage='cognitive_memorise',
           manual_started_at=$2,last_action_key=$3,updated_at=now() WHERE id=$1`,
          [race.id, boundaryAt, body.operationId],
        );
      } else if (body.action === "memorise_complete") {
        if (race.currentStage !== "cognitive_memorise") throw Object.assign(new Error("Cognitive memorisation is not active"), { status: 409 });
        await addSplit("cognitive_memorise", "Cognitive Memorisation");
        await client.query(
          `UPDATE race_sessions SET current_stage='run_1',last_action_key=$2,updated_at=now() WHERE id=$1`,
          [race.id, body.operationId],
        );
      } else if (body.action === "complete_stage") {
        const stage = raceStage(body.stageId);
        if (!stage || body.stageId !== race.currentStage || !["run", "station"].includes(stage.kind)) {
          throw Object.assign(new Error("This stage is not ready to complete"), { status: 409 });
        }
        const splitId = await addSplit(stage.id, stage.name);
        let isOoc = race.isOoc;
        if (stage.kind === "station") {
          const stationNumber = stage.stationNumber!;
          const outcome = body.outcome ?? "none";
          const penaltySeconds = Number(body.penaltySeconds ?? 0);
          const note = String(body.note ?? "").trim();
          if (!validateStationOutcome(stationNumber, outcome, penaltySeconds, note, race.contestId)) {
            const message = outcome === "penalty" && stationNumber === 3 && !allowsBearCrawlPenalty(race.contestId)
              ? "Bear Crawl penalties do not apply to this participant's contest"
              : "Choose an allowed outcome and add a note for ICS";
            throw Object.assign(new Error(message), { status: 400 });
          }
          await client.query(
            `INSERT INTO station_outcomes(
              race_session_id,event_id,participant_id,judge_id,operation_key,
              station_number,outcome,penalty_seconds,note,split_id
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [race.id, race.eventId, race.participantId, race.judgeId, body.operationId,
              stationNumber, outcome, penaltySeconds, note, splitId],
          );
          isOoc = isOoc || outcome === "ics";
          deliveryIds.push(await insertOutbox(client, body.operationId, race, `station${stationNumber}penalty`, penaltySeconds));
          deliveryIds.push(await insertOutbox(client, body.operationId, race, `station${stationNumber}ics`, outcome === "ics" ? 1 : 0));
          deliveryIds.push(await insertOutbox(client, body.operationId, race, `station${stationNumber}note`, note));
          if (outcome === "ics") deliveryIds.push(await insertOutbox(client, body.operationId, race, "Status", 1));
        }
        const recallStartedAt = stage.id === "station_6" ? boundaryAt : race.cognitiveRecallStartedAt;
        await client.query(
          `UPDATE race_sessions SET current_stage=$2,is_ooc=$3,
           cognitive_recall_started_at=$4,last_action_key=$5,updated_at=now() WHERE id=$1`,
          [race.id, stage.nextId, isOoc, recallStartedAt, body.operationId],
        );
      } else if (body.action === "complete_recall") {
        if (race.currentStage !== "cognitive_recall" || body.response.length !== colorSequence.length) {
          throw Object.assign(new Error("Ten cognitive responses are required"), { status: 400 });
        }
        if (!body.response.every((color) => ["R", "G", "Y"].includes(color))) {
          throw Object.assign(new Error("Cognitive response contains an invalid colour"), { status: 400 });
        }
        const splitId = await addSplit("cognitive_recall", "Cognitive Recall");
        const adjustment = cognitiveAdjustment(body.response);
        const recallStartedAt = race.cognitiveRecallStartedAt ? new Date(race.cognitiveRecallStartedAt) : previousAt;
        await client.query(
          `INSERT INTO cognitive_attempts(
            race_session_id,event_id,participant_id,judge_id,operation_key,
            sequence,response,tap_observed_at,correct_count,percentage,
            penalty_seconds,bonus_seconds,recall_started_at,recall_finished_at,
            recall_duration_ms,split_id
           ) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [race.id, race.eventId, race.participantId, race.judgeId, body.operationId,
            JSON.stringify(colorSequence), JSON.stringify(body.response), JSON.stringify(body.tapObservedAt ?? []),
            adjustment.correctCount, adjustment.percentage, adjustment.penaltySeconds,
            adjustment.bonusSeconds, recallStartedAt, boundaryAt,
            Math.max(0, boundaryAt.getTime() - recallStartedAt.getTime()), splitId],
        );
        deliveryIds.push(await insertOutbox(client, body.operationId, race, "cognitiveskillpenalty", adjustment.penaltySeconds));
        deliveryIds.push(await insertOutbox(client, body.operationId, race, "cognitiveskillbonus", adjustment.bonusSeconds));
        await client.query(
          `UPDATE race_sessions SET current_stage='finish_approach',
           last_action_key=$2,updated_at=now() WHERE id=$1`,
          [race.id, body.operationId],
        );
      } else if (body.action === "finish") {
        if (race.currentStage !== "finish_approach") throw Object.assign(new Error("Finish Line is not ready"), { status: 409 });
        await addSplit("finish_line", "Finish Line");
        await client.query(
          `UPDATE race_sessions SET current_stage='complete',state='finished',
           finished_at=$2,last_action_key=$3,updated_at=now() WHERE id=$1`,
          [race.id, boundaryAt, body.operationId],
        );
      }

      await client.query(
        `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
         VALUES($1,$2,$3,'race_session',$4,$5::jsonb)`,
        [auth.user.id, race.eventId, `timing.${body.action}`, race.id, JSON.stringify(body)],
      );
    });

    await Promise.allSettled(deliveryIds.map((id) => deliverOutboxOperation(id, auth.user.eventId!)));
    const snapshot = await raceSnapshot(auth.user.eventId!, auth.user.id, body.bib);
    return Response.json(snapshot, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Timing action failed" },
      { status: (error as { status?: number }).status ?? 500 },
    );
  }
}
