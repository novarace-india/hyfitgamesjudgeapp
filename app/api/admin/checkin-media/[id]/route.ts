import { readFile } from "node:fs/promises";
import { audit, requireUser } from "../../../../../lib/auth.server";
import { query } from "../../../../../lib/db";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request, ["super_admin", "event_admin"]);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const result = await query<{ storagePath: string; mimeType: string; participantId: string }>(
    `SELECT storage_path AS "storagePath",mime_type AS "mimeType",participant_id AS "participantId"
     FROM checkin_media WHERE id=$1 AND event_id=$2 AND deleted_at IS NULL`,
    [id,auth.user.eventId],
  );
  const media = result.rows[0];
  if (!media) return Response.json({ error: "Media not found" }, { status: 404 });
  try {
    const bytes = await readFile(media.storagePath);
    await audit(auth.user.id,auth.user.eventId,"checkin.media.view","checkin_media",id,{ participantId:media.participantId });
    return new Response(bytes, { headers: { "content-type": media.mimeType, "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Media file is unavailable" }, { status: 410 });
  }
}
