import { randomUUID } from "node:crypto";
import { requireUser } from "../../../../lib/auth.server";
import { transaction } from "../../../../lib/db";
import { raceResultLocalTimestamp, type CheckinStageType } from "../../../../lib/checkin-stage";
import { deliverOutboxOperation } from "../../penalties/route";

type StageBody = {
  participantId?: unknown;
  stageType?: unknown;
  assetCode?: unknown;
  governmentIdVerified?: unknown;
  verbalDeclarationAccepted?: unknown;
  photoMediaId?: unknown;
  signatureMediaId?: unknown;
  idempotencyKey?: unknown;
  clientObservedAt?: unknown;
};

const stageAsset = {
  STAGE_1_WRISTBAND: "wristband",
  STAGE_2_TRANSPONDER: "transponder1",
} as const;

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "checkin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as StageBody;
  const participantId = String(body.participantId ?? "");
  const stageType = String(body.stageType ?? "") as CheckinStageType;
  const assetCode = String(body.assetCode ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (!participantId || !assetCode || !stageAsset[stageType] ||
      !/^[A-Za-z0-9:_-]{8,100}$/.test(idempotencyKey)) {
    return Response.json({ error: "Participant, stage, asset code, and transaction key are required" }, { status: 400 });
  }
  if (stageType === "STAGE_1_WRISTBAND" &&
      (body.governmentIdVerified !== true || body.verbalDeclarationAccepted !== true)) {
    return Response.json({ error: "Government ID and participant declaration must be confirmed" }, { status: 400 });
  }
  const observedAt = String(body.clientObservedAt ?? "").trim() || null;
  if (observedAt && Number.isNaN(Date.parse(observedAt))) {
    return Response.json({ error: "Client timestamp is invalid" }, { status: 400 });
  }

  try {
    const saved = await transaction(async (client) => {
      const replay = await client.query(
        `SELECT transaction_id AS "transactionId",participant_bib_snapshot AS bib,state,
          completed_at AS "completedAt",asset_code_snapshot AS "assetCode"
         FROM checkin_stage_records WHERE event_id=$1 AND volunteer_id=$2 AND idempotency_key=$3`,
        [auth.user.eventId, auth.user.id, idempotencyKey],
      );
      if (replay.rows[0]) return { ...replay.rows[0], operationIds: [] as string[], replayed: true };

      const stationResult = await client.query(
        `SELECT s.id,s.code,s.name,s.stage_type AS "stageType",a.id AS "assignmentId"
         FROM checkin_station_assignments a JOIN checkin_stations s ON s.id=a.station_id
         WHERE a.event_id=$1 AND a.volunteer_id=$2 AND a.released_at IS NULL AND s.enabled=true
         FOR UPDATE OF a`,
        [auth.user.eventId, auth.user.id],
      );
      const station = stationResult.rows[0];
      if (!station) throw Object.assign(new Error("Admin must assign you to an enabled check-in counter"), { status: 409 });
      if (station.stageType !== stageType) throw Object.assign(new Error("This counter cannot complete that check-in stage"), { status: 403 });

      const participantResult = await client.query(
        `SELECT p.id,p.bib,p.name,p.gender,p.date_of_birth AS "dateOfBirth",p.category,p.wave,p.club,e.timezone
         FROM participants p JOIN events e ON e.id=p.event_id
         WHERE p.id=$1 AND p.event_id=$2 FOR UPDATE OF p`,
        [participantId, auth.user.eventId],
      );
      const participant = participantResult.rows[0];
      if (!participant) throw Object.assign(new Error("Participant not found"), { status: 404 });

      if (stageType === "STAGE_2_TRANSPONDER") {
        const stage1 = await client.query(
          `SELECT 1 FROM checkin_stage_records
           WHERE event_id=$1 AND participant_id=$2 AND stage_type='STAGE_1_WRISTBAND' AND state<>'reversed'`,
          [auth.user.eventId, participantId],
        );
        if (!stage1.rowCount) throw Object.assign(new Error("Stage 1 must be completed before assigning a transponder"), { status: 409 });
      }

      const configResult = await client.query(
        `SELECT update_mapping AS "updateMapping",
          require_participant_photo AS "requirePhoto",
          require_declaratory_signature AS "requireSignature",
          declaration_text AS "declarationText",declaration_version AS "declarationVersion"
         FROM event_configs WHERE event_id=$1 AND state='published' ORDER BY version DESC LIMIT 1`,
        [auth.user.eventId],
      );
      const config = configResult.rows[0] ?? {};
      if (stageType === "STAGE_1_WRISTBAND" && config.requirePhoto && !body.photoMediaId) {
        throw Object.assign(new Error("Participant photo is required for this event"), { status: 400 });
      }
      if (stageType === "STAGE_1_WRISTBAND" && config.requireSignature && !body.signatureMediaId) {
        throw Object.assign(new Error("Participant signature is required for this event"), { status: 400 });
      }
      for (const [mediaId, mediaType] of [[body.photoMediaId, "participant_photo"], [body.signatureMediaId, "signature"]]) {
        if (!mediaId) continue;
        const media = await client.query(
          `SELECT 1 FROM checkin_media WHERE id=$1 AND event_id=$2 AND participant_id=$3
           AND transaction_id=$4 AND media_type=$5 AND deleted_at IS NULL`,
          [String(mediaId),auth.user.eventId,participantId,idempotencyKey,mediaType],
        );
        if (!media.rowCount) throw Object.assign(new Error("Captured evidence does not belong to this athlete transaction"), { status: 400 });
      }

      const transactionId = randomUUID();
      const completedAt = new Date();
      const stageField = stageType === "STAGE_1_WRISTBAND" ? "stage1checkin" : "stage2checkin";
      const timeField = stageType === "STAGE_1_WRISTBAND" ? "stage1checkintime" : "stage2checkintime";
      const assetField = stageType === "STAGE_1_WRISTBAND" ? "wristbandID" : "Transponder1";
      const mapping = config.updateMapping ?? {};
      const values = [
        [mapping[stageField] ?? stageField, "COMPLETED", "status"],
        [mapping[timeField] ?? timeField, raceResultLocalTimestamp(completedAt, participant.timezone), "time"],
        [mapping[stageType === "STAGE_1_WRISTBAND" ? "wristband" : "transponder1"] ?? assetField, assetCode, stageAsset[stageType]],
      ];

      const asset = await client.query(
        `INSERT INTO asset_assignments(event_id,participant_id,asset_type,asset_code,assigned_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [auth.user.eventId, participantId, stageAsset[stageType], assetCode, auth.user.id],
      );
      const record = await client.query(
        `INSERT INTO checkin_stage_records(
          transaction_id,idempotency_key,event_id,participant_id,stage_type,volunteer_id,
          station_id,station_assignment_id,session_id,participant_bib_snapshot,
          participant_name_snapshot,gender_snapshot,date_of_birth_snapshot,contest_snapshot,
          wave_snapshot,club_snapshot,volunteer_staff_id_snapshot,volunteer_name_snapshot,
          station_code_snapshot,station_name_snapshot,asset_code_snapshot,
          government_id_verified,declaration_text_snapshot,declaration_version_snapshot,
          verbal_declaration_accepted,photo_media_id,signature_media_id,device_label_snapshot,
          source_ip_snapshot,client_observed_at,event_timezone_snapshot,completed_at
        ) VALUES(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
        ) RETURNING id`,
        [
          transactionId,idempotencyKey,auth.user.eventId,participantId,stageType,auth.user.id,
          station.id,station.assignmentId,auth.user.sessionId,participant.bib,participant.name,
          participant.gender,participant.dateOfBirth,participant.category,participant.wave,
          participant.club,auth.user.staffId,auth.user.name,station.code,station.name,assetCode,
          stageType === "STAGE_1_WRISTBAND",stageType === "STAGE_1_WRISTBAND" ? config.declarationText ?? "" : "",
          stageType === "STAGE_1_WRISTBAND" ? config.declarationVersion ?? 1 : null,
          stageType === "STAGE_1_WRISTBAND",body.photoMediaId || null,body.signatureMediaId || null,
          auth.user.deviceLabel,auth.user.ipAddress,observedAt,participant.timezone,completedAt,
        ],
      );

      const operationIds: string[] = [];
      for (const [field, value, purpose] of values) {
        const operation = await client.query(
          `INSERT INTO outbox_operations(operation_key,event_id,participant_id,bib,field_name,value)
           VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [`checkin-${stageType === "STAGE_1_WRISTBAND" ? "stage1" : "stage2"}:${transactionId}:${purpose}`,
            auth.user.eventId,participantId,participant.bib,field,value],
        );
        operationIds.push(operation.rows[0].id);
      }
      await client.query(
        `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
         VALUES($1,$2,$3,'checkin_stage',$4,$5::jsonb)`,
        [auth.user.id,auth.user.eventId,stageType === "STAGE_1_WRISTBAND" ? "checkin.stage1.complete" : "checkin.stage2.complete",
          record.rows[0].id,JSON.stringify({ transactionId,bib:participant.bib,station,assetAssignmentId:asset.rows[0].id,assetCode,operationIds })],
      );
      return { transactionId,bib:participant.bib,state:"pending_sync",completedAt:completedAt.toISOString(),assetCode,operationIds,replayed:false };
    });

    if (!saved.replayed) {
      const deliveries = await Promise.all(saved.operationIds.map((id) => deliverOutboxOperation(id, auth.user.eventId!)));
      const state = deliveries.every((item) => item.state === "confirmed")
        ? "completed"
        : deliveries.some((item) => item.state === "conflict") ? "attention" : "pending_sync";
      await transaction(async (client) => {
        await client.query("UPDATE checkin_stage_records SET state=$2 WHERE transaction_id=$1", [saved.transactionId, state]);
      });
      saved.state = state;
    }
    return Response.json(saved, { status: saved.replayed ? 200 : 201 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return Response.json({ error: "This stage or asset is already assigned" }, { status: 409 });
    if (code === "23503") return Response.json({ error: "Required photo or signature evidence was not found" }, { status: 400 });
    const status = (error as { status?: number }).status ?? 500;
    return Response.json({ error: status === 500 ? "Check-in stage could not be completed" : (error as Error).message }, { status });
  }
}
