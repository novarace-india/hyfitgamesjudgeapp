import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const assignmentRoute = fs.readFileSync("app/api/checkin/assign/route.ts", "utf8");
const worker = fs.readFileSync("scripts/outbox-worker.mjs", "utf8");
const migration = fs.readFileSync("db/migrations/003_checkin_stations_audit.sql", "utf8");
const mappingMigration = fs.readFileSync("db/migrations/004_correct_transponder1_mapping.sql", "utf8");

test("check-in queues exactly the three RaceResult fields with correct casing", () => {
  assert.match(assignmentRoute, /mapping\.checkinStatus \?\? "checkinstatus"/);
  assert.match(assignmentRoute, /mapping\.wristband \?\? "wristbandid"/);
  assert.match(assignmentRoute, /mapping\.transponder1 \?\? "Transponder1"/);
  assert.match(assignmentRoute, /const values: Array<\[string, string, string\]>/);
});

test("station identity comes from authenticated server-side assignment", () => {
  assert.match(assignmentRoute, /FROM checkin_station_assignments a/);
  assert.match(assignmentRoute, /a\.volunteer_id=\$2/);
  assert.doesNotMatch(assignmentRoute, /body\.desk/);
  assert.doesNotMatch(assignmentRoute, /body\.stationId/);
});

test("check-in captures immutable audit snapshots and idempotency", () => {
  for (const column of [
    "participant_bib_snapshot",
    "participant_name_snapshot",
    "volunteer_staff_id_snapshot",
    "volunteer_name_snapshot",
    "station_code_snapshot",
    "station_name_snapshot",
    "wristband_code_snapshot",
    "transponder1_code_snapshot",
    "device_label_snapshot",
    "source_ip_snapshot",
    "event_timezone_snapshot",
  ]) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(migration, /unique_checkin_idempotency/);
  assert.match(assignmentRoute, /checkin\.complete/);
});

test("worker confirms only the three operations for one check-in transaction", () => {
  assert.match(worker, /operation_key\.match\(\/\^checkin:/);
  assert.match(worker, /status\?\.total === 3 && status\.confirmed === 3/);
  assert.match(worker, /UPDATE checkins SET state='complete'/);
  assert.match(worker, /UPDATE checkins SET state='conflict'/);
});

test("legacy lowercase default mapping is corrected without replacing custom mappings", () => {
  assert.match(mappingMigration, /update_mapping->>'transponder1' = 'transponder1'/);
  assert.match(mappingMigration, /'"Transponder1"'/);
});
