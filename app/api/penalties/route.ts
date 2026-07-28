import {
  isNumericBib,
  isPenaltyField,
  isPenaltyValue,
} from "../../penalties.ts";

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
