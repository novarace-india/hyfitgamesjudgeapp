export type RaceResultUpdate = {
  bib: string;
  fieldName: string;
  value: string | number;
};

export function raceResultUpdateTarget(endpoint: string, update: RaceResultUpdate) {
  const target = new URL(endpoint);
  target.searchParams.set("bib", update.bib);
  target.searchParams.set("fieldname", update.fieldName);
  target.searchParams.set("value", String(update.value));
  target.searchParams.set("nohistory", "0");
  return target;
}

export async function postRaceResultUpdate(
  endpoint: string,
  update: RaceResultUpdate,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
) {
  const target = raceResultUpdateTarget(endpoint, update);
  const fetchImpl = options.fetchImpl ?? fetch;
  return fetchImpl(target, {
    method: "POST",
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    headers: { accept: "application/json,text/plain,*/*" },
  });
}
