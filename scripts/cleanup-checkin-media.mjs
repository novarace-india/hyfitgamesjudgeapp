import { unlink } from "node:fs/promises";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: databaseUrl, options: "-c search_path=hyfit_ops,public" });
try {
  const expired = await pool.query(
    `SELECT id,event_id,participant_id,storage_path FROM checkin_media
     WHERE deleted_at IS NULL AND expires_at<=now() ORDER BY expires_at LIMIT 500`,
  );
  for (const media of expired.rows) {
    try { await unlink(media.storage_path); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await pool.query("BEGIN");
    try {
      await pool.query("UPDATE checkin_media SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL", [media.id]);
      await pool.query(
        `INSERT INTO audit_events(event_id,action,entity_type,entity_id,details)
         VALUES($1,'checkin.media.retention_delete','checkin_media',$2,$3::jsonb)`,
        [media.event_id,media.id,JSON.stringify({ participantId:media.participant_id,reason:"retention_expired" })],
      );
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
  process.stdout.write(`Deleted ${expired.rowCount} expired Check-In media files\n`);
} finally {
  await pool.end();
}
