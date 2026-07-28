import { randomUUID } from "node:crypto";
import { requireUser } from "../../../../lib/auth.server";
import { transaction } from "../../../../lib/db";

type AssignmentBody = {
  participantId?: unknown;
  wristbandCode?: unknown;
  transponderCode?: unknown;
  idempotencyKey?: unknown;
  clientObservedAt?: unknown;
  reason?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "checkin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as AssignmentBody;
  const participantId = String(body.participantId ?? "");
  const wristband = String(body.wristbandCode ?? "").trim();
  const transponder = String(body.transponderCode ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  const clientObservedAt = String(body.clientObservedAt ?? "").trim() || null;
  if (!participantId || !wristband || !transponder || wristband === transponder) {
    return Response.json({ error: "Participant, distinct wristband, and Transponder1 codes are required" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9:_-]{8,100}$/.test(idempotencyKey)) {
    return Response.json({ error: "A valid check-in transaction key is required" }, { status: 400 });
  }
  if (clientObservedAt && Number.isNaN(Date.parse(clientObservedAt))) {
    return Response.json({ error: "Client timestamp is invalid" }, { status: 400 });
  }

  try {
    const result = await transaction(async (client) => {
      const replay = await client.query(
        `SELECT c.transaction_id AS "transactionId",c.participant_bib_snapshot AS bib,
          c.verified_at AS "acceptedAt",c.station_code_snapshot AS "stationCode",
          c.station_name_snapshot AS "stationName",c.state
         FROM checkins c WHERE c.event_id=$1 AND c.volunteer_id=$2 AND c.idempotency_key=$3`,
        [auth.user.eventId, auth.user.id, idempotencyKey],
      );
      if (replay.rows[0]) return { ...replay.rows[0], replayed: true };

      const participantResult = await client.query<{ bib: string; name: string; timezone: string }>(
        `SELECT p.bib,p.name,e.timezone FROM participants p
         JOIN events e ON e.id=p.event_id
         WHERE p.id=$1 AND p.event_id=$2 FOR UPDATE OF p`,
        [participantId, auth.user.eventId],
      );
      const participant = participantResult.rows[0];
      if (!participant) throw Object.assign(new Error("Participant not found"), { status: 404 });

      const stationResult = await client.query<{
        assignmentId: string;
        stationId: string;
        stationCode: string;
        stationName: string;
      }>(
        `SELECT a.id AS "assignmentId",s.id AS "stationId",s.code AS "stationCode",s.name AS "stationName"
         FROM checkin_station_assignments a
         JOIN checkin_stations s ON s.id=a.station_id
         WHERE a.event_id=$1 AND a.volunteer_id=$2 AND a.released_at IS NULL AND s.enabled=true
         FOR UPDATE OF a`,
        [auth.user.eventId, auth.user.id],
      );
      const station = stationResult.rows[0];
      if (!station) throw Object.assign(new Error("Admin must assign you to an enabled check-in counter"), { status: 409 });

      const transactionId = randomUUID();
      await client.query(
        `UPDATE asset_assignments SET active=false,released_at=now(),reason=COALESCE($3,reason)
          WHERE event_id=$1 AND participant_id=$2 AND active`,
        [auth.user.eventId, participantId, String(body.reason ?? "") || null],
      );
      await client.query(
        `INSERT INTO asset_assignments(event_id,participant_id,asset_type,asset_code,assigned_by,reason)
         VALUES($1,$2,'wristband',$3,$5,$6),($1,$2,'transponder1',$4,$5,$6)`,
        [auth.user.eventId, participantId, wristband, transponder, auth.user.id, String(body.reason ?? "") || null],
      );
      const checkin = await client.query<{ id: string; acceptedAt: string }>(
        `INSERT INTO checkins(
          event_id,participant_id,volunteer_id,station_id,station_assignment_id,session_id,
          transaction_id,idempotency_key,desk,state,participant_bib_snapshot,
          participant_name_snapshot,volunteer_staff_id_snapshot,volunteer_name_snapshot,
          station_code_snapshot,station_name_snapshot,wristband_code_snapshot,
          transponder1_code_snapshot,device_label_snapshot,source_ip_snapshot,
          client_observed_at,event_timezone_snapshot
        ) VALUES(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_sync',$10,$11,$12,$13,$14,$15,
          $16,$17,$18,$19,$20,$21
        ) RETURNING id,verified_at AS "acceptedAt"`,
        [
          auth.user.eventId, participantId, auth.user.id, station.stationId,
          station.assignmentId, auth.user.sessionId, transactionId, idempotencyKey,
          station.stationName, participant.bib, participant.name, auth.user.staffId,
          auth.user.name, station.stationCode, station.stationName, wristband,
          transponder, auth.user.deviceLabel, auth.user.ipAddress, clientObservedAt,
          participant.timezone,
        ],
      );
      const config = await client.query<{ update_mapping: Record<string, string> }>(
        `SELECT update_mapping FROM event_configs WHERE event_id=$1 AND state='published' ORDER BY version DESC LIMIT 1`,
        [auth.user.eventId],
      );
      const mapping = config.rows[0]?.update_mapping ?? {};
      const values: Array<[string, string, string]> = [
        ["status", mapping.checkinStatus ?? "checkinstatus", "1"],
        ["wristband", mapping.wristband ?? "wristbandid", wristband],
        ["transponder1", mapping.transponder1 ?? "Transponder1", transponder],
      ];
      const operationIds: string[] = [];
      for (const [purpose, field, value] of values) {
        const operation = await client.query<{ id: string }>(
          `INSERT INTO outbox_operations(operation_key,event_id,participant_id,bib,field_name,value)
           VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [`checkin:${transactionId}:${purpose}`, auth.user.eventId, participantId, participant.bib, field, value],
        );
        operationIds.push(operation.rows[0].id);
      }
      await client.query("UPDATE participants SET checkin_state='pending_sync',updated_at=now() WHERE id=$1", [participantId]);
      await client.query(
        `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'checkin.complete','checkin',$3,$4::jsonb)`,
        [auth.user.id, auth.user.eventId, checkin.rows[0].id, JSON.stringify({
          transactionId, participantId, bib: participant.bib,
          participantName: participant.name, volunteerId: auth.user.id,
          volunteerStaffId: auth.user.staffId, volunteerName: auth.user.name,
          stationId: station.stationId, stationAssignmentId: station.assignmentId,
          stationCode: station.stationCode, stationName: station.stationName,
          wristband, transponder1: transponder, sessionId: auth.user.sessionId,
          deviceLabel: auth.user.deviceLabel, sourceIp: auth.user.ipAddress,
          clientObservedAt, operationIds,
        })],
      );
      return {
        transactionId,
        bib: participant.bib,
        acceptedAt: checkin.rows[0].acceptedAt,
        stationCode: station.stationCode,
        stationName: station.stationName,
        state: "pending_sync",
      };
    });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return Response.json({ error: "This wristband or transponder is already assigned" }, { status: 409 });
    const status = (error as { status?: number }).status ?? 500;
    return Response.json({ error: status === 500 ? "Check-in could not be completed" : (error as Error).message }, { status });
  }
}
