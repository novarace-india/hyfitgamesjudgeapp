import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeBib,
  normalizeParticipants,
  valueAtPath,
} from "../app/participant-sync.server.ts";
import {
  demoParticipants,
  participantInitials,
  searchParticipants,
} from "../app/participants.ts";

const config = {
  listPath: "data.entries",
  bibField: "bibNumber",
  nameField: "fullName",
  categoryField: "race.category",
  waveField: "race.wave",
  statusField: "state",
  idField: "participantId",
};

test("extracts configurable nested values", () => {
  assert.deepEqual(valueAtPath({ data: { entries: [1, 2] } }, "data.entries"), [1, 2]);
  assert.equal(valueAtPath({ data: {} }, "data.entries"), undefined);
});

test("normalizes numeric BIBs while preserving leading zeros", () => {
  assert.equal(normalizeBib("0025645"), "0025645");
  assert.equal(normalizeBib(25645), "25645");
  assert.equal(normalizeBib("A-1842"), null);
});

test("maps participant fields and rejects invalid or duplicate BIBs", () => {
  const result = normalizeParticipants(
    {
      data: {
        entries: [
          { participantId: "p1", bibNumber: "0025", fullName: "Riya Sharma", race: { category: "Open", wave: "W1" }, state: "ready" },
          { participantId: "p2", bibNumber: "0025", fullName: "Duplicate Bib", race: { category: "Open", wave: "W1" }, state: "ready" },
          { participantId: "p3", bibNumber: "3141", fullName: "Arjun Menon", race: { category: "Pro", wave: "W2" }, state: "active" },
          { participantId: "p4", bibNumber: "ABC", fullName: "Invalid Bib" },
        ],
      },
    },
    config,
  );

  assert.equal(result.rejectedCount, 3);
  assert.deepEqual(result.participants, [
    {
      id: "p3",
      bib: "3141",
      name: "Arjun Menon",
      category: "Pro",
      wave: "W2",
      avatar: "AM",
      status: "On course",
    },
  ]);
});

test("derives initials and ranks exact BIB matches first", () => {
  assert.equal(participantInitials("Meera and Tara"), "MA");
  const matches = searchParticipants(
    [
      { ...demoParticipants[0], bib: "125645", name: "Contains 25645" },
      demoParticipants[0],
    ],
    "25645",
  );
  assert.equal(matches[0].bib, "25645");
});
