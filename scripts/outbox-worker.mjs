import pg from "pg";
import { postRaceResultUpdate } from "../lib/raceresult-update.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 4, options: "-c search_path=hyfit_ops,public" });
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function processBatch() {
  const client = await pool.connect();
  let operations = [];
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE outbox_operations SET state='failed',
       last_error=COALESCE(last_error,'Delivery interrupted before confirmation'),
       next_attempt_at=now(),updated_at=now()
       WHERE state='processing' AND updated_at<now()-interval '30 seconds'`,
    );
    const result = await client.query(
      `SELECT o.*,c.update_api_url FROM outbox_operations o
       JOIN LATERAL (
         SELECT update_api_url FROM event_configs
         WHERE event_id=o.event_id AND state='published'
         ORDER BY version DESC LIMIT 1
       ) c ON true
       WHERE o.state IN ('pending','failed') AND o.next_attempt_at<=now()
         AND NOT EXISTS (
           SELECT 1 FROM outbox_operations older
           WHERE older.event_id=o.event_id AND older.bib=o.bib AND older.field_name=o.field_name
             AND older.created_at<o.created_at
             AND older.state IN ('pending','processing','failed')
         )
       ORDER BY o.created_at LIMIT 25 FOR UPDATE OF o SKIP LOCKED`,
    );
    operations = result.rows;
    if (operations.length) {
      await client.query("UPDATE outbox_operations SET state='processing',updated_at=now() WHERE id=ANY($1::uuid[])", [operations.map((item) => item.id)]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  for (const operation of operations) {
    try {
      if (!operation.update_api_url) throw new Error("Published RaceResult update endpoint is empty");
      const response = await postRaceResultUpdate(operation.update_api_url, {
        bib: operation.bib,
        fieldName: operation.field_name,
        value: operation.value,
      });
      if (!response.ok) {
        const error = new Error(`RaceResult HTTP ${response.status}`);
        error.permanent = response.status >= 400 && response.status < 500;
        throw error;
      }
      await pool.query("UPDATE outbox_operations SET state='confirmed',confirmed_at=now(),updated_at=now(),last_error=NULL WHERE id=$1", [operation.id]);
      const checkinMatch = operation.operation_key.match(/^checkin:([^:]+):/);
      if (checkinMatch) {
        const synchronization = await pool.query(
          `SELECT c.id,
            count(o.*)::int AS total,
            count(*) FILTER(WHERE o.state='confirmed')::int AS confirmed,
            count(*) FILTER(WHERE o.state='conflict')::int AS conflicts
           FROM checkins c
           LEFT JOIN outbox_operations o ON o.operation_key LIKE 'checkin:'||c.transaction_id||':%'
           WHERE c.transaction_id=$1 GROUP BY c.id`,
          [checkinMatch[1]],
        );
        const status = synchronization.rows[0];
        if (status?.total === 3 && status.confirmed === 3) {
          await pool.query("UPDATE checkins SET state='complete' WHERE id=$1", [status.id]);
          await pool.query("UPDATE participants SET checkin_state='checked_in' WHERE id=$1", [operation.participant_id]);
        }
      }
      const stageMatch = operation.operation_key.match(/^checkin-stage[12]:([^:]+):/);
      if (stageMatch) {
        const synchronization = await pool.query(
          `SELECT r.id,
            count(o.*)::int AS total,
            count(*) FILTER(WHERE o.state='confirmed')::int AS confirmed,
            count(*) FILTER(WHERE o.state='conflict')::int AS conflicts
           FROM checkin_stage_records r
           LEFT JOIN outbox_operations o
             ON o.operation_key LIKE 'checkin-stage%:'||r.transaction_id||':%'
           WHERE r.transaction_id=$1 GROUP BY r.id`,
          [stageMatch[1]],
        );
        const status = synchronization.rows[0];
        if (status?.total === 3 && status.confirmed === 3) {
          await pool.query("UPDATE checkin_stage_records SET state='completed' WHERE id=$1", [status.id]);
        }
      }
    } catch (error) {
      const attempts = operation.attempts + 1;
      const state = error?.permanent || attempts >= 8 ? "conflict" : "failed";
      const delay = Math.min(300, 2 ** attempts);
      await pool.query(
        `UPDATE outbox_operations SET state=$2,attempts=$3,last_error=$4,next_attempt_at=now()+($5||' seconds')::interval,updated_at=now() WHERE id=$1`,
        [operation.id, state, attempts, String(error instanceof Error ? error.message : error).slice(0, 500), delay],
      );
      if (state === "conflict" && operation.participant_id) {
        await pool.query("UPDATE participants SET checkin_state='conflict' WHERE id=$1", [operation.participant_id]);
        const checkinMatch = operation.operation_key.match(/^checkin:([^:]+):/);
        if (checkinMatch) await pool.query("UPDATE checkins SET state='conflict' WHERE transaction_id=$1", [checkinMatch[1]]);
        const stageMatch = operation.operation_key.match(/^checkin-stage[12]:([^:]+):/);
        if (stageMatch) await pool.query("UPDATE checkin_stage_records SET state='attention' WHERE transaction_id=$1", [stageMatch[1]]);
      }
    }
  }
  return operations.length;
}

process.stdout.write("HYFIT RaceResult outbox worker started\n");
while (!stopping) {
  try {
    const count = await processBatch();
    if (!count) await new Promise((resolve) => setTimeout(resolve, 1500));
  } catch (error) {
    process.stderr.write(`Outbox worker: ${error instanceof Error ? error.message : error}\n`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
await pool.end();
