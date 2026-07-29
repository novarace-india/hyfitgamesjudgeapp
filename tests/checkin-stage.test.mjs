import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  isDoublesContest,
  raceResultLocalTimestamp,
  teamWarning,
} from "../lib/checkin-stage.ts";

const stageRoute = fs.readFileSync("app/api/checkin/stage/route.ts", "utf8");
const migration = fs.readFileSync("db/migrations/005_two_stage_checkin.sql", "utf8");
const worker = fs.readFileSync("scripts/outbox-worker.mjs", "utf8");

test("formats authoritative timestamps in the event timezone", () => {
  assert.equal(
    raceResultLocalTimestamp(new Date("2026-07-29T09:02:18.000Z"), "Asia/Kolkata"),
    "2026-07-29 14:32:18",
  );
});

test("recognizes Doubles contests without treating singles as teams", () => {
  assert.equal(isDoublesContest("HYFIT Female Doubles"), true);
  assert.equal(isDoublesContest("Male Open"), false);
});

test("reports malformed Doubles groups without blocking valid individual data", () => {
  assert.equal(teamWarning({ category: "Male Open", club: "" }, []), null);
  assert.equal(teamWarning({ category: "Mixed Doubles", club: "" }, []), "Doubles team has no club identifier");
  assert.equal(teamWarning({ category: "Mixed Doubles", club: "Rapid" }, []), "Doubles teammate was not found");
  assert.equal(teamWarning({ category: "Mixed Doubles", club: "Rapid" }, [{ id: "2" }]), null);
  assert.equal(teamWarning({ category: "Mixed Doubles", club: "Rapid" }, [{ id: "2" }, { id: "3" }]), "More than two athletes share this Doubles club");
});

test("defines the exact six RaceResult stage fields and immediate delivery", () => {
  for (const field of [
    "stage1checkin",
    "stage1checkintime",
    "wristbandID",
    "stage2checkin",
    "stage2checkintime",
    "Transponder1",
  ]) assert.match(stageRoute, new RegExp(field));
  assert.match(stageRoute, /deliverOutboxOperation/);
  assert.match(stageRoute, /Promise\.all\(saved\.operationIds/);
});

test("keeps stage records independent, idempotent, and worker-recoverable", () => {
  assert.match(migration, /UNIQUE\(event_id,volunteer_id,idempotency_key\)/);
  assert.match(migration, /one_active_participant_checkin_stage/);
  assert.match(worker, /checkin-stage\[12\]/);
  assert.match(worker, /UPDATE checkin_stage_records SET state='completed'/);
  assert.match(worker, /UPDATE checkin_stage_records SET state='attention'/);
});
