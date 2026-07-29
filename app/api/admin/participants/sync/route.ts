import { audit, requireUser } from "../../../../../lib/auth.server.ts";
import { query, transaction } from "../../../../../lib/db.ts";
import { classifyParticipantImport, parseParticipantImport } from "../../../../../lib/participant-import.ts";

type SyncResult = {
  id: string;
  state: string;
  importedCount: number;
  rejectedCount: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "readonly"]);
  if ("error" in auth) return auth.error;
  const eventId = new URL(request.url).searchParams.get("eventId") ?? auth.user.eventId;
  const result = await query<SyncResult>(
    `SELECT id,state,imported_count AS "importedCount",rejected_count AS "rejectedCount",
      started_at AS "startedAt",finished_at AS "finishedAt",error
      FROM sync_runs WHERE event_id=$1 AND kind='participants'
      ORDER BY started_at DESC LIMIT 10`,
    [eventId],
  );
  return Response.json({ syncRuns: result.rows });
}

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin"]);
  if ("error" in auth) return auth.error;
  const eventId = auth.user.eventId;
  if (!eventId) return Response.json({ error: "No event is assigned to this administrator" }, { status: 400 });

  const config = await query<{ participantApiUrl: string; participantMapping: Record<string, unknown> }>(
    `SELECT participant_api_url AS "participantApiUrl",participant_mapping AS "participantMapping"
       FROM event_configs WHERE event_id=$1 AND state='published'
       ORDER BY version DESC LIMIT 1`,
    [eventId],
  );
  const published = config.rows[0];
  if (!published?.participantApiUrl?.trim()) {
    return Response.json({ error: "Publish a RaceResult participant fetch endpoint before syncing" }, { status: 409 });
  }

  let run;
  try {
    run = await query<{ id: string }>(
      `INSERT INTO sync_runs(event_id,kind,state) VALUES($1,'participants','running') RETURNING id`,
      [eventId],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return Response.json({ error: "A participant sync is already running" }, { status: 409 });
    }
    throw error;
  }
  const runId = run.rows[0].id;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let payload: unknown;
    try {
      const response = await fetch(published.participantApiUrl, {
        headers: { accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`RaceResult participant endpoint returned HTTP ${response.status}`);
      payload = await response.json();
    } finally {
      clearTimeout(timeout);
    }

    const normalized = parseParticipantImport(payload, published.participantMapping ?? {});
    if (!normalized.participants.length) {
      throw new Error(`RaceResult returned no valid participants (${normalized.rejectedCount} rejected)`);
    }

    const counts = await transaction(async (client) => {
      const existingRows = await client.query<{
        bib: string;
        name: string;
        category: string;
        wave: string;
        gender: string;
        dateOfBirth: string;
        club: string;
        sourceId: string;
      }>(
        `SELECT bib,name,category,wave,gender,COALESCE(date_of_birth::text,'') AS "dateOfBirth",
          club,COALESCE(source_id,'') AS "sourceId"
           FROM participants WHERE event_id=$1`,
        [eventId],
      );
      const existing = new Map(existingRows.rows.map((participant) => [participant.bib, participant]));
      const classification = classifyParticipantImport(existing, normalized.participants);

      for (const participant of normalized.participants) {
        await client.query(
          `INSERT INTO participants(event_id,source_id,bib,name,category,wave,gender,date_of_birth,club,source_status,source_data,last_source_sync_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,NULLIF($8,'')::date,$9,$10,$11::jsonb,now())
           ON CONFLICT(event_id,bib) DO UPDATE SET
             source_id=EXCLUDED.source_id,name=EXCLUDED.name,category=EXCLUDED.category,
             wave=EXCLUDED.wave,gender=EXCLUDED.gender,date_of_birth=EXCLUDED.date_of_birth,
             club=EXCLUDED.club,source_status=EXCLUDED.source_status,
             source_data=EXCLUDED.source_data,last_source_sync_at=now(),updated_at=now()`,
          [
            eventId,
            participant.id,
            participant.bib,
            participant.name,
            participant.category,
            participant.wave,
            participant.gender,
            participant.dateOfBirth,
            participant.club,
            participant.status,
            JSON.stringify(participant),
          ],
        );
      }
      return classification;
    });

    await query(
      `UPDATE sync_runs SET state='complete',imported_count=$2,rejected_count=$3,finished_at=now()
       WHERE id=$1`,
      [runId, normalized.participants.length, normalized.rejectedCount],
    );
    const result = {
      runId,
      imported: normalized.participants.length,
      rejected: normalized.rejectedCount,
      ...counts,
      finishedAt: new Date().toISOString(),
    };
    await audit(auth.user.id, eventId, "participants.sync", "sync_run", runId, result);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "RaceResult participant request timed out"
      : error instanceof Error ? error.message : "Participant sync failed";
    await query(
      `UPDATE sync_runs SET state='failed',error=$2,finished_at=now() WHERE id=$1`,
      [runId, message.slice(0, 1000)],
    );
    const status = (error as { status?: number }).status ?? 502;
    return Response.json({ error: message, runId }, { status });
  }
}
