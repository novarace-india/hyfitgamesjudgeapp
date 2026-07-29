import {
  isNumericBib,
  isPenaltyField,
  isPenaltyValue,
} from "../../penalties.ts";
import { requireUser } from "../../../lib/auth.server.ts";
import { query, transaction } from "../../../lib/db.ts";
import { postRaceResultUpdate } from "../../../lib/raceresult-update.ts";

type PenaltyRequest = {
  bib?: unknown;
  fieldName?: unknown;
  value?: unknown;
  operationId?: unknown;
};

type StoredPenaltyOperation = {
  id: string;
  eventId: string;
  bib: string;
  fieldName: string;
  value: string;
  state: "pending" | "processing" | "confirmed" | "failed" | "conflict";
  updateApiUrl?: string;
  confirmedAt?: string;
};

export async function deliverOutboxOperation(operationId: string, eventId: string) {
  const existing = await query<StoredPenaltyOperation>(
    `SELECT o.id,o.event_id AS "eventId",o.bib,o.field_name AS "fieldName",o.value,o.state,
      o.confirmed_at AS "confirmedAt"
     FROM outbox_operations o WHERE o.id=$1 AND o.event_id=$2`,
    [operationId, eventId],
  );
  const current = existing.rows[0];
  if (!current) throw new Error("Penalty operation was not found after saving");
  if (current.state === "confirmed") {
    return { state: "confirmed" as const, confirmedAt: current.confirmedAt ?? new Date().toISOString() };
  }
  if (current.state === "conflict") return { state: "conflict" as const };

  const claimed = await query<StoredPenaltyOperation>(
    `UPDATE outbox_operations o SET state='processing',updated_at=now()
     WHERE o.id=$1 AND o.event_id=$2
       AND o.state IN ('pending','failed')
       AND o.next_attempt_at<=now()
       AND NOT EXISTS (
         SELECT 1 FROM outbox_operations older
         WHERE older.event_id=o.event_id AND older.bib=o.bib AND older.field_name=o.field_name
           AND older.created_at<o.created_at
           AND older.state IN ('pending','processing','failed')
       )
     RETURNING o.id,o.event_id AS "eventId",o.bib,o.field_name AS "fieldName",o.value,o.state`,
    [operationId, eventId],
  );
  const operation = claimed.rows[0];
  if (!operation) return { state: "pending" as const };

  const config = await query<{ updateApiUrl: string }>(
    `SELECT update_api_url AS "updateApiUrl" FROM event_configs
     WHERE event_id=$1 AND state='published' ORDER BY version DESC LIMIT 1`,
    [eventId],
  );
  const endpoint = config.rows[0]?.updateApiUrl?.trim();
  if (!endpoint) {
    await query(
      `UPDATE outbox_operations SET state='conflict',attempts=attempts+1,
       last_error='Published RaceResult update endpoint is empty',updated_at=now() WHERE id=$1`,
      [operation.id],
    );
    return { state: "conflict" as const };
  }

  try {
    void new URL(endpoint);
  } catch {
    await query(
      `UPDATE outbox_operations SET state='conflict',attempts=attempts+1,
       last_error='Published RaceResult update endpoint is invalid',updated_at=now() WHERE id=$1`,
      [operation.id],
    );
    return { state: "conflict" as const };
  }

  try {
    const response = await postRaceResultUpdate(endpoint, operation);
    if (response.ok) {
      const confirmedAt = new Date().toISOString();
      await query(
        `UPDATE outbox_operations SET state='confirmed',confirmed_at=$2,updated_at=now(),last_error=NULL
         WHERE id=$1`,
        [operation.id, confirmedAt],
      );
      return { state: "confirmed" as const, confirmedAt };
    }

    if (response.status >= 400 && response.status < 500) {
      await query(
        `UPDATE outbox_operations SET state='conflict',attempts=attempts+1,
         last_error=$2,updated_at=now() WHERE id=$1`,
        [operation.id, `RaceResult HTTP ${response.status}`],
      );
      return { state: "conflict" as const };
    }
    throw new Error(`RaceResult HTTP ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "RaceResult connection failed";
    await query(
      `UPDATE outbox_operations SET state='failed',attempts=attempts+1,last_error=$2,
       next_attempt_at=now()+interval '2 seconds',updated_at=now() WHERE id=$1`,
      [operation.id, message.slice(0, 500)],
    );
    return { state: "pending" as const };
  }
}

export async function POST(request: Request) {
  let payload: PenaltyRequest;
  try {
    payload = await request.json() as PenaltyRequest;
  } catch {
    return Response.json({ error: "Invalid JSON request" }, { status: 400 });
  }

  if (
    !isNumericBib(payload.bib) ||
    !isPenaltyField(payload.fieldName) ||
    !isPenaltyValue(payload.value) ||
    typeof payload.operationId !== "string" ||
    !payload.operationId.trim()
  ) {
    return Response.json({ error: "Invalid penalty update" }, { status: 400 });
  }

  if (process.env.DATABASE_URL) {
    const auth = await requireUser(request, ["super_admin","event_admin","judge"]);
    if ("error" in auth) return auth.error;
    try {
      const savedAt = new Date().toISOString();
      const operation = await transaction(async (client) => {
        const stored = await client.query<StoredPenaltyOperation>(
          `SELECT o.id,o.event_id AS "eventId",o.bib,o.field_name AS "fieldName",o.value,o.state,
            o.confirmed_at AS "confirmedAt"
           FROM outbox_operations o
           JOIN penalty_events pe ON pe.operation_id=o.operation_key
           WHERE o.operation_key=$1 AND o.event_id=$2 AND pe.judge_id=$3`,
          [payload.operationId, auth.user.eventId, auth.user.id],
        );
        if (stored.rows[0]) {
          const existing = stored.rows[0];
          if (
            existing.bib !== payload.bib ||
            existing.fieldName !== payload.fieldName ||
            existing.value !== String(payload.value)
          ) {
            throw Object.assign(new Error("Operation ID was already used for a different penalty"), { status: 409 });
          }
          return existing;
        }

        const active = await client.query<{ race_id: string; participant_id: string }>(
          `SELECT r.id AS race_id,p.id AS participant_id FROM race_sessions r
           JOIN participants p ON p.id=r.participant_id
           WHERE r.event_id=$1 AND r.judge_id=$2 AND p.bib=$3 AND r.state='active'`,
          [auth.user.eventId, auth.user.id, payload.bib],
        );
        if (!active.rows[0]) throw Object.assign(new Error("No active race session for this athlete"), { status: 409 });
        await client.query(
          `INSERT INTO penalty_events(operation_id,event_id,race_session_id,participant_id,judge_id,field_name,value)
           VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(operation_id) DO NOTHING`,
          [payload.operationId, auth.user.eventId, active.rows[0].race_id, active.rows[0].participant_id, auth.user.id, payload.fieldName, payload.value],
        );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO outbox_operations(operation_key,event_id,participant_id,bib,field_name,value)
           VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [payload.operationId, auth.user.eventId, active.rows[0].participant_id, payload.bib, payload.fieldName, String(payload.value)],
        );
        await client.query(
          `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
           VALUES($1,$2,'penalty.save','race_session',$3,$4::jsonb)`,
          [auth.user.id, auth.user.eventId, active.rows[0].race_id, JSON.stringify({ fieldName: payload.fieldName, value: payload.value })],
        );
        return {
          id: inserted.rows[0].id,
          eventId: auth.user.eventId,
          bib: payload.bib,
          fieldName: payload.fieldName,
          value: String(payload.value),
          state: "pending" as const,
        };
      });
      const delivery = await deliverOutboxOperation(operation.id, auth.user.eventId);
      return Response.json({
        operationId: payload.operationId,
        bib: payload.bib,
        fieldName: payload.fieldName,
        value: payload.value,
        savedAt: delivery.state === "confirmed" ? delivery.confirmedAt : savedAt,
        deliveryState: delivery.state,
        pendingRaceResult: delivery.state === "pending",
      }, { status: delivery.state === "confirmed" ? 200 : 202 });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: (error as { status?: number }).status ?? 500 });
    }
  }

  const endpoint = process.env.RACERESULT_UPDATE_API_URL?.trim();
  const savedAt = new Date().toISOString();
  if (!endpoint) {
    return Response.json({
      operationId: payload.operationId,
      bib: payload.bib,
      fieldName: payload.fieldName,
      value: payload.value,
      savedAt,
      demo: true,
    });
  }

  try {
    const response = await postRaceResultUpdate(endpoint, {
      bib: payload.bib,
      fieldName: payload.fieldName,
      value: payload.value,
    });
    if (!response.ok) {
      console.error("RaceResult penalty update failed", response.status);
      return Response.json({ error: "RaceResult rejected the update" }, { status: 502 });
    }
    return Response.json({
      operationId: payload.operationId,
      bib: payload.bib,
      fieldName: payload.fieldName,
      value: payload.value,
      savedAt,
      deliveryState: "confirmed",
    });
  } catch (error) {
    console.error("RaceResult penalty update failed", error);
    return Response.json({ error: "RaceResult update is temporarily unavailable" }, { status: 502 });
  }
}
