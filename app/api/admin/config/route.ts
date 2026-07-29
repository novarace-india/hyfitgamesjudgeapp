import { audit, requireUser } from "../../../../lib/auth.server";
import { query, transaction } from "../../../../lib/db";

export async function GET(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin","readonly"]);
  if ("error" in auth) return auth.error;
  const eventId = new URL(request.url).searchParams.get("eventId") ?? auth.user.eventId;
  const result = await query(
    `SELECT id,event_id AS "eventId",version,state,participant_api_url AS "participantApiUrl",
      update_api_url AS "updateApiUrl",participant_mapping AS "participantMapping",
      update_mapping AS "updateMapping",rules,
      require_participant_photo AS "requireParticipantPhoto",
      require_declaratory_signature AS "requireDeclaratorySignature",
      declaration_text AS "declarationText",declaration_version AS "declarationVersion",
      media_retention_days AS "mediaRetentionDays",published_at AS "publishedAt"
      FROM event_configs WHERE event_id=$1 ORDER BY version DESC LIMIT 1`,
    [eventId],
  );
  return Response.json({ config: result.rows[0] ?? null });
}

export async function PUT(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as Record<string, unknown>;
  const eventId = String(body.eventId ?? auth.user.eventId ?? "");
  if (!eventId) return Response.json({ error: "Event is required" }, { status: 400 });
  const retentionDays = Number(body.mediaRetentionDays ?? 30);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    return Response.json({ error: "Media retention must be between 1 and 365 days" }, { status: 400 });
  }
  const declarationText = String(body.declarationText ?? "").trim() ||
    "I confirm that my participant details are correct and that I have received the assigned race equipment.";
  const result = await query<{ id: string; version: number }>(
    `INSERT INTO event_configs(event_id,version,state,participant_api_url,update_api_url,participant_mapping,update_mapping,rules,
      require_participant_photo,require_declaratory_signature,declaration_text,declaration_version,media_retention_days)
     VALUES($1,COALESCE((SELECT max(version)+1 FROM event_configs WHERE event_id=$1),1),'draft',$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,
      $7,$8,$9,COALESCE((SELECT max(declaration_version)+1 FROM event_configs WHERE event_id=$1 AND declaration_text<>$9),1),$10)
     RETURNING id,version`,
    [eventId, String(body.participantApiUrl ?? ""), String(body.updateApiUrl ?? ""), JSON.stringify(body.participantMapping ?? {}), JSON.stringify(body.updateMapping ?? {}), JSON.stringify(body.rules ?? {}), Boolean(body.requireParticipantPhoto), Boolean(body.requireDeclaratorySignature), declarationText, retentionDays],
  );
  await audit(auth.user.id, eventId, "config.save_draft", "event_config", result.rows[0].id, { version: result.rows[0].version });
  return Response.json(result.rows[0], { status: 201 });
}

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin","event_admin"]);
  if ("error" in auth) return auth.error;
  const body = await request.json() as { id?: string; eventId?: string };
  if (!body.id || !body.eventId) return Response.json({ error: "Configuration and event are required" }, { status: 400 });
  await transaction(async (client) => {
    await client.query("UPDATE event_configs SET state='retired' WHERE event_id=$1 AND state='published'", [body.eventId]);
    const published = await client.query(
      `UPDATE event_configs SET state='published',published_at=now(),published_by=$2 WHERE id=$1 AND state='draft' RETURNING version`,
      [body.id, auth.user.id],
    );
    if (!published.rowCount) throw new Error("Draft configuration not found");
    await client.query("UPDATE events SET config_version=$2,updated_at=now() WHERE id=$1", [body.eventId, published.rows[0].version]);
  });
  await audit(auth.user.id, body.eventId, "config.publish", "event_config", body.id, {});
  return Response.json({ ok: true });
}
