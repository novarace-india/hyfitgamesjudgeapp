import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeBib,
  normalizeParticipants,
  valueAtPath,
} from "../app/participant-sync.server.ts";
import {
  demoParticipants,
  findParticipantByScannedBib,
  participantInitials,
  parseScannedBib,
  searchParticipants,
} from "../app/participants.ts";
import {
  classifyParticipantImport,
  parseParticipantImport,
  participantFieldConfig,
} from "../lib/participant-import.ts";

const config = {
  listPath: "data.entries",
  bibField: "bibNumber",
  nameField: "fullName",
  categoryField: "race.category",
  contestIdField: "ContestID",
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
      contestId: "",
      wave: "W2",
      gender: "",
      dateOfBirth: "",
      club: "",
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

test("accepts only numeric scanned BIB values", () => {
  assert.equal(parseScannedBib(" 25645 "), "25645");
  assert.equal(parseScannedBib("0025"), "0025");
  assert.equal(parseScannedBib("BIB-25645"), null);
  assert.equal(parseScannedBib("25645\nextra"), null);
});

test("matches scanned BIBs exactly against cached participants", () => {
  assert.equal(findParticipantByScannedBib(demoParticipants, "25645")?.name, "Riya Sharma");
  assert.equal(findParticipantByScannedBib(demoParticipants, "2564"), null);
  assert.equal(findParticipantByScannedBib(demoParticipants, "A-25645"), null);
});

test("supports concise and explicit Admin participant mapping keys", () => {
  assert.deepEqual(
    participantFieldConfig({ listPath: "data.rows", bib: "Bib", name: "FullName" }),
    {
      listPath: "data.rows",
      bibField: "Bib",
      nameField: "FullName",
    categoryField: "category",
    contestIdField: "ContestID",
    waveField: "wave",
    genderField: "Gender",
    dateOfBirthField: "DateOfBirth",
    clubField: "club",
    statusField: "status",
      idField: "id",
    },
  );
  assert.equal(participantFieldConfig({ bibField: "bibNo" }).bibField, "bibNo");
});

test("classifies inserted, updated, and unchanged participant imports", () => {
  const existing = new Map([
    ["1", { name: "Same", category: "Open", wave: "W1", sourceId: "p1" }],
    ["2", { name: "Old name", category: "Open", wave: "W1", sourceId: "p2" }],
  ]);
  assert.deepEqual(
    classifyParticipantImport(existing, [
      { bib: "1", name: "Same", category: "Open", wave: "W1", id: "p1" },
      { bib: "2", name: "New name", category: "Open", wave: "W1", id: "p2" },
      { bib: "3", name: "New", category: "Pro", wave: "W2", id: "p3" },
    ]),
    { inserted: 1, updated: 1, unchanged: 1 },
  );
});

test("recognizes RaceResult capitalized fields and composes participant names", () => {
  const result = parseParticipantImport(
    [
      { Bib: 25645, "First Name": "Riya", Lastname: "Sharma", Contest: "Female Open" },
      { Bib: 25646, "First Name": "Rishabh", Lastname: "Shah", Contest: "Male Open" },
    ],
    { listPath: "", bib: "bib", name: "name" },
  );
  assert.equal(result.rejectedCount, 0);
  assert.deepEqual(result.participants.map(({ bib, name, category }) => ({ bib, name, category })), [
    { bib: "25645", name: "Riya Sharma", category: "Female Open" },
    { bib: "25646", name: "Rishabh Shah", category: "Male Open" },
  ]);
});
