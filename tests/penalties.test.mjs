import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/penalties/route.ts";
import {
  isNumericBib,
  isPenaltyField,
  isPenaltyValue,
  stationPenaltyField,
  upsertPenaltyOperation,
} from "../app/penalties.ts";
import {
  postRaceResultUpdate,
  raceResultUpdateTarget,
} from "../lib/raceresult-update.ts";

function penaltyRequest(body) {
  return new Request("http://localhost/api/penalties", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("validates the RaceResult penalty field contract", () => {
  assert.equal(stationPenaltyField(0), "station1penalty");
  assert.equal(stationPenaltyField(5), "station6penalty");
  assert.equal(isPenaltyField("cognitiveskillpenalty"), true);
  assert.equal(isPenaltyField("Status"), false);
  assert.equal(isNumericBib("0025645"), true);
  assert.equal(isNumericBib("A-1"), false);
  assert.equal(isPenaltyValue(0), true);
  assert.equal(isPenaltyValue(3601), false);
});

test("replaces a queued value for the same BIB and field", () => {
  const first = { operationId: "one", bib: "25645", fieldName: "station1penalty", value: 10, createdAt: "now", attemptCount: 0 };
  const replacement = { ...first, operationId: "two", value: 0 };
  assert.deepEqual(upsertPenaltyOperation([first], replacement), [replacement]);
});

test("supports explicit demo mode without an update endpoint", async () => {
  const previous = process.env.RACERESULT_UPDATE_API_URL;
  delete process.env.RACERESULT_UPDATE_API_URL;
  try {
    const response = await POST(penaltyRequest({
      operationId: "demo-one",
      bib: "25645",
      fieldName: "station2penalty",
      value: 15,
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).demo, true);
  } finally {
    if (previous === undefined) delete process.env.RACERESULT_UPDATE_API_URL;
    else process.env.RACERESULT_UPDATE_API_URL = previous;
  }
});

test("POSTs exact values with participant history enabled", async () => {
  const previousUrl = process.env.RACERESULT_UPDATE_API_URL;
  const previousFetch = globalThis.fetch;
  process.env.RACERESULT_UPDATE_API_URL = "https://api.raceresult.com/386828/APIKEY";
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response("ok", { status: 200 });
  };

  try {
    const response = await POST(penaltyRequest({
      operationId: "save-one",
      bib: "25645",
      fieldName: "station3penalty",
      value: 20,
    }));
    assert.equal(response.status, 200);
    const target = new URL(captured.url);
    assert.equal(captured.init.method, "POST");
    assert.equal(target.searchParams.get("bib"), "25645");
    assert.equal(target.searchParams.get("fieldname"), "station3penalty");
    assert.equal(target.searchParams.get("value"), "20");
    assert.equal(target.searchParams.get("nohistory"), "0");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.RACERESULT_UPDATE_API_URL;
    else process.env.RACERESULT_UPDATE_API_URL = previousUrl;
  }
});

test("builds the documented RaceResult part/savevalue parameters", () => {
  const target = raceResultUpdateTarget(
    "https://api.raceresult.com/386828/APIKEY?existing=kept",
    { bib: "008650", fieldName: "station1penalty", value: 0 },
  );
  assert.equal(target.searchParams.get("existing"), "kept");
  assert.equal(target.searchParams.get("bib"), "008650");
  assert.equal(target.searchParams.get("fieldname"), "station1penalty");
  assert.equal(target.searchParams.get("value"), "0");
  assert.equal(target.searchParams.get("nohistory"), "0");
});

test("shared RaceResult delivery POSTs immediately", async () => {
  let captured;
  const response = await postRaceResultUpdate(
    "https://api.raceresult.com/386828/APIKEY",
    { bib: "8650", fieldName: "cognitiveskillpenalty", value: 30 },
    {
      fetchImpl: async (url, init) => {
        captured = { url: String(url), init };
        return new Response("ok", { status: 200 });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(captured.init.method, "POST");
  const target = new URL(captured.url);
  assert.equal(target.searchParams.get("bib"), "8650");
  assert.equal(target.searchParams.get("fieldname"), "cognitiveskillpenalty");
  assert.equal(target.searchParams.get("value"), "30");
  assert.equal(target.searchParams.get("nohistory"), "0");
});

test("shared RaceResult delivery reports connectivity failures to its durable caller", async () => {
  await assert.rejects(
    postRaceResultUpdate(
      "https://api.raceresult.com/386828/APIKEY",
      { bib: "8650", fieldName: "station6penalty", value: 0 },
      {
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
      },
    ),
    /fetch failed/,
  );
});
