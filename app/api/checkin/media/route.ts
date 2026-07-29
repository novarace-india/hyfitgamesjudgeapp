import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "../../../../lib/auth.server";
import { query } from "../../../../lib/db";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const auth = await requireUser(request, ["super_admin", "event_admin", "checkin"]);
  if ("error" in auth) return auth.error;
  const form = await request.formData();
  const file = form.get("file");
  const participantId = String(form.get("participantId") ?? "");
  const transactionKey = String(form.get("transactionKey") ?? "");
  const mediaType = String(form.get("mediaType") ?? "");
  if (!(file instanceof File) || !participantId || !/^[A-Za-z0-9:_-]{8,100}$/.test(transactionKey) ||
      !["participant_photo", "signature"].includes(mediaType)) {
    return Response.json({ error: "Valid participant, media, and transaction are required" }, { status: 400 });
  }
  if (!allowedTypes.has(file.type) || file.size < 100 || file.size > 5_000_000) {
    return Response.json({ error: "Use a JPG, PNG, or WebP image smaller than 5 MB" }, { status: 400 });
  }

  const context = await query(
    `SELECT s.stage_type AS "stageType",e.ends_at AS "endsAt",
      COALESCE(c.media_retention_days,30) AS "retentionDays"
     FROM checkin_station_assignments a
     JOIN checkin_stations s ON s.id=a.station_id
     JOIN events e ON e.id=a.event_id
     LEFT JOIN LATERAL (
       SELECT media_retention_days FROM event_configs
       WHERE event_id=e.id AND state='published' ORDER BY version DESC LIMIT 1
     ) c ON true
     WHERE a.event_id=$1 AND a.volunteer_id=$2 AND a.released_at IS NULL AND s.enabled=true`,
    [auth.user.eventId, auth.user.id],
  );
  if (context.rows[0]?.stageType !== "STAGE_1_WRISTBAND") {
    return Response.json({ error: "Media can only be captured at a Stage 1 counter" }, { status: 403 });
  }
  const participant = await query("SELECT bib FROM participants WHERE id=$1 AND event_id=$2", [participantId, auth.user.eventId]);
  if (!participant.rowCount) return Response.json({ error: "Participant not found" }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const id = randomUUID();
  const root = path.resolve(process.env.CHECKIN_MEDIA_DIR ?? ".data/checkin-media");
  const directory = path.join(root, String(auth.user.eventId));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const storagePath = path.join(directory, `${id}.${extension}`);
  await writeFile(storagePath, bytes, { mode: 0o600, flag: "wx" });
  const retentionBase = context.rows[0].endsAt ? new Date(context.rows[0].endsAt) : new Date();
  const expiresAt = new Date(retentionBase.getTime() + Number(context.rows[0].retentionDays) * 86_400_000);

  await query(
    `INSERT INTO checkin_media(
      id,event_id,participant_id,transaction_id,media_type,storage_path,mime_type,
      checksum_sha256,byte_size,expires_at,created_by
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id,auth.user.eventId,participantId,transactionKey,mediaType,storagePath,file.type,checksum,bytes.length,expiresAt,auth.user.id],
  );
  return Response.json({ mediaId: id, checksum, capturedAt: new Date().toISOString() }, { status: 201 });
}
