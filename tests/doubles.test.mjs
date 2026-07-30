import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  doublesContests,
  isDoublesContestId,
  normalizedTeamClub,
  sameDoublesTeam,
} from "../app/doubles.ts";

test("uses only the four authoritative Doubles ContestIDs", () => {
  assert.deepEqual(doublesContests, {
    "9": "Bloodline Doubles",
    "10": "Male Doubles",
    "11": "Female Doubles",
    "12": "Mixed Doubles",
  });
  for (const id of ["9", "10", "11", "12"]) assert.equal(isDoublesContestId(id), true);
  for (const id of ["", "1", "8", "13", 9]) assert.equal(isDoublesContestId(id), false);
});

test("matches a Doubles team by distinct athlete, ContestID, and normalized club", () => {
  const first = { id: "a", contestId: "12", club: " Rapid   Racers " };
  assert.equal(sameDoublesTeam(first, { id: "b", contestId: "12", club: "rapid racers" }), true);
  assert.equal(sameDoublesTeam(first, { id: "a", contestId: "12", club: "rapid racers" }), false);
  assert.equal(sameDoublesTeam(first, { id: "b", contestId: "11", club: "rapid racers" }), false);
  assert.equal(sameDoublesTeam(first, { id: "b", contestId: "12", club: "" }), false);
  assert.equal(normalizedTeamClub("  Team   One "), "team one");
});

test("team-session migration and claim preserve Singles while locking both Doubles athletes", () => {
  const migration = fs.readFileSync("db/migrations/007_doubles_team_sessions.sql", "utf8");
  const claim = fs.readFileSync("app/api/judge/claim/route.ts", "utf8");
  assert.match(migration, /race_mode IN \('single','doubles'\)/);
  assert.match(migration, /unique_active_race_session_participant/);
  assert.match(claim, /readinessConfirmed/);
  assert.match(claim, /race_mode/);
  assert.match(claim, /race_session_participants/);
  assert.match(claim, /body\.participantId/);
});

test("Judge timing fans shared operations out to every linked participant", () => {
  const timing = fs.readFileSync("app/api/judge/timing/route.ts", "utf8");
  const consoleUi = fs.readFileSync("app/timing-console.tsx", "utf8");
  assert.match(timing, /race_session_participants/);
  assert.match(timing, /deliveryTargets/);
  assert.match(timing, /Promise\.all/);
  assert.match(timing, /race\.raceMode === "doubles" \? null : boundaryAt/);
  assert.match(timing, /body\.action === "team_start"/);
  assert.match(timing, /released_at=\$2/);
  assert.match(consoleUi, /First partner starts/);
  assert.match(consoleUi, /Last partner finishes/);
  assert.match(consoleUi, /Team result confirmed for both BIBs/);
});

test("Check-In and Judge UI use ContestID-based Doubles behavior", () => {
  const checkin = fs.readFileSync("app/checkin/page.tsx", "utf8");
  const judge = fs.readFileSync("app/page.tsx", "utf8");
  assert.match(checkin, /isDoublesContestId\(participant\.contestId\)/);
  assert.match(judge, /Scan partner 2 wristband/);
  assert.match(judge, /Confirm both athletes are ready/);
  assert.match(judge, /isDoublesContestId\(athlete\.contestId\)/);
});
