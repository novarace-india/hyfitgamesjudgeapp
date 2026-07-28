import assert from "node:assert/strict";
import test from "node:test";

import { colorChoices, colorSequence, scoreSequence } from "../app/cognitive-sequence.ts";

test("uses the ten-position R/G/Y sequence", () => {
  assert.equal(colorSequence.length, 10);
  assert.deepEqual(Object.keys(colorChoices), ["R", "G", "Y"]);
});

test("scores an exact response as 100%", () => {
  assert.deepEqual(scoreSequence([...colorSequence]), {
    correctCount: 10,
    percentage: 100,
  });
});

test("scores matches by position", () => {
  assert.deepEqual(
    scoreSequence(["R", "G", "Y", "G", "R", "G", "Y", "R", "G", "R"]),
    {
      correctCount: 8,
      percentage: 80,
    },
  );
});

test("scores a fully incorrect response as 0%", () => {
  assert.deepEqual(scoreSequence(["G", "Y", "R", "Y", "G", "Y", "R", "G", "R", "Y"]), {
    correctCount: 0,
    percentage: 0,
  });
});
