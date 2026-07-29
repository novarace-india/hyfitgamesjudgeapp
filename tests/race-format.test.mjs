import assert from "node:assert/strict";
import test from "node:test";

import {
  cognitiveAdjustment,
  formatRaceTime,
  raceStage,
  raceStages,
  validateStationOutcome,
} from "../app/race-format.ts";

test("defines the complete guided timing sequence", () => {
  assert.equal(raceStage("ready").nextId, "cognitive_memorise");
  assert.equal(raceStage("cognitive_memorise").nextId, "run_1");
  assert.equal(raceStage("run_1").nextId, "station_1");
  assert.equal(raceStage("station_6").nextId, "cognitive_recall");
  assert.equal(raceStage("cognitive_recall").nextId, "finish_approach");
  assert.equal(raceStage("finish_approach").nextId, "complete");
  assert.equal(raceStages.filter((stage) => stage.kind === "run").length, 6);
  assert.equal(raceStages.filter((stage) => stage.kind === "station").length, 6);
});

test("allows only the fixed Bear Crawl penalty", () => {
  assert.equal(validateStationOutcome(3, "penalty", 10, ""), true);
  assert.equal(validateStationOutcome(3, "penalty", 20, ""), false);
  assert.equal(validateStationOutcome(2, "penalty", 10, ""), false);
  assert.equal(validateStationOutcome(1, "none", 0, ""), true);
});

test("requires notes for incomplete stations", () => {
  assert.equal(validateStationOutcome(1, "ics", 0, ""), false);
  assert.equal(validateStationOutcome(6, "ics", 0, "Could not complete required reps"), true);
  assert.equal(validateStationOutcome(6, "ics", 10, "Incomplete"), false);
});

test("calculates cognitive penalty, neutral result, and bonus", () => {
  assert.deepEqual(cognitiveAdjustment(["R", "G", "Y", "G", "R", "R", "R", "R", "R", "R"]), {
    correctCount: 6,
    percentage: 60,
    penaltySeconds: 30,
    bonusSeconds: 0,
  });
  assert.deepEqual(cognitiveAdjustment(["R", "G", "Y", "G", "R", "G", "Y", "R", "R", "R"]), {
    correctCount: 8,
    percentage: 80,
    penaltySeconds: 0,
    bonusSeconds: 0,
  });
  assert.deepEqual(cognitiveAdjustment(["R", "G", "Y", "G", "R", "G", "Y", "R", "Y", "G"]), {
    correctCount: 10,
    percentage: 100,
    penaltySeconds: 0,
    bonusSeconds: 30,
  });
});

test("formats backup timing with tenths", () => {
  assert.equal(formatRaceTime(0), "00:00.0");
  assert.equal(formatRaceTime(125678), "02:05.6");
});
