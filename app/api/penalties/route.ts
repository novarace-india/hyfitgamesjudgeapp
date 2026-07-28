import {
  isNumericBib,
  isPenaltyField,
  isPenaltyValue,
} from "../../penalties.ts";
import { requireUser } from "../../../lib/auth.server.ts";
import { transaction } from "../../../lib/db.ts";

type PenaltyRequest = {
  bib?: unknown;
  fieldName?: unknown;
  value?: unknown;
  operationId?: unknown;
};

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
      await transaction(async (client) => {
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
        await client.query(
          `INSERT INTO outbox_operations(operation_key,event_id,participant_id,bib,field_name,value)
           VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(operation_key) DO NOTHING`,
          [payload.operationId, auth.user.eventId, active.rows[0].participant_id, payload.bib, payload.fieldName, String(payload.value)],
        );
        await client.query(
          `INSERT INTO audit_events(actor_id,event_id,action,entity_type,entity_id,details)
           VALUES($1,$2,'penalty.save','race_session',$3,$4::jsonb)`,
          [auth.user.id, auth.user.eventId, active.rows[0].race_id, JSON.stringify({ fieldName: payload.fieldName, value: payload.value })],
        );
      });
      return Response.json({ operationId: payload.operationId, bib: payload.bib, fieldName: payload.fieldName, value: payload.value, savedAt, pendingRaceResult: true });
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

  const target = new URL(endpoint);
  target.searchParams.set("bib", payload.bib);
  target.searchParams.set("fieldname", payload.fieldName);
  target.searchParams.set("value", String(payload.value));
  target.searchParams.set("nohistory", "0");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(target, {
      method: "POST",
      signal: controller.signal,
      headers: { accept: "application/json, text/plain, */*" },
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
    });
  } catch (error) {
    console.error("RaceResult penalty update failed", error);
    return Response.json({ error: "RaceResult update is temporarily unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
