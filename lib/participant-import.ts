import { normalizeParticipants, valueAtPath, type ParticipantFieldConfig } from "../app/participant-sync.server.ts";

export type StoredParticipantMapping = Record<string, unknown>;

function mappingValue(mapping: StoredParticipantMapping, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = mapping[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

export function participantFieldConfig(mapping: StoredParticipantMapping): ParticipantFieldConfig {
  return {
    listPath: mappingValue(mapping, ["listPath", "participantListPath"], ""),
    bibField: mappingValue(mapping, ["bibField", "bib"], "bib"),
    nameField: mappingValue(mapping, ["nameField", "name"], "name"),
    categoryField: mappingValue(mapping, ["categoryField", "category"], "category"),
    waveField: mappingValue(mapping, ["waveField", "wave"], "wave"),
    statusField: mappingValue(mapping, ["statusField", "status"], "status"),
    idField: mappingValue(mapping, ["idField", "id"], "id"),
  };
}

export function parseParticipantImport(payload: unknown, mapping: StoredParticipantMapping) {
  const config = participantFieldConfig(mapping);
  const source = valueAtPath(payload, config.listPath);
  if (!Array.isArray(source) || !source.length || !source[0] || typeof source[0] !== "object") {
    return normalizeParticipants(payload, config);
  }

  const sample = source[0] as Record<string, unknown>;
  const keys = Object.keys(sample);
  const matchingKey = (configured: string, aliases: string[]) => {
    if (configured && valueAtPath(sample, configured) !== undefined) return configured;
    const normalizedAliases = aliases.map((alias) => alias.toLowerCase().replace(/[^a-z0-9]/g, ""));
    return keys.find((key) => normalizedAliases.includes(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) ?? configured;
  };

  config.bibField = matchingKey(config.bibField, ["bib", "bibnumber", "startnumber"]);
  config.categoryField = matchingKey(config.categoryField, ["category", "contest", "race"]);
  config.waveField = matchingKey(config.waveField, ["wave", "startwave", "startgroup"]);
  config.statusField = matchingKey(config.statusField, ["status", "participantstatus"]);
  config.idField = matchingKey(config.idField, ["participantid", "id", "bib"]);

  const resolvedName = matchingKey(config.nameField, ["name", "fullname", "participantname"]);
  if (valueAtPath(sample, resolvedName) !== undefined) {
    config.nameField = resolvedName;
    return normalizeParticipants(payload, config);
  }

  const firstNameKey = matchingKey("", ["firstname", "givenname"]);
  const lastNameKey = matchingKey("", ["lastname", "surname", "familyname"]);
  if (!firstNameKey && !lastNameKey) return normalizeParticipants(payload, config);

  const adapted = source.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const record = item as Record<string, unknown>;
    const fullName = [record[firstNameKey], record[lastNameKey]]
      .filter((value) => value != null && String(value).trim())
      .map((value) => String(value).trim())
      .join(" ");
    return { ...record, __hyfitFullName: fullName };
  });
  config.nameField = "__hyfitFullName";
  return normalizeParticipants(config.listPath ? setValueAtPath(payload, config.listPath, adapted) : adapted, config);
}

function setValueAtPath(payload: unknown, path: string, value: unknown): unknown {
  if (!path) return value;
  const root = payload && typeof payload === "object" && !Array.isArray(payload)
    ? structuredClone(payload)
    : {};
  const segments = path.split(".");
  let current = root as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    current[segment] = next && typeof next === "object" && !Array.isArray(next) ? next : {};
    current = current[segment] as Record<string, unknown>;
  }
  current[segments.at(-1)!] = value;
  return root;
}

export function classifyParticipantImport(
  existing: Map<string, { name: string; category: string; wave: string; sourceId: string }>,
  incoming: Array<{ bib: string; name: string; category: string; wave: string; id: string }>,
) {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const participant of incoming) {
    const current = existing.get(participant.bib);
    if (!current) {
      inserted += 1;
    } else if (
      current.name !== participant.name ||
      current.category !== participant.category ||
      current.wave !== participant.wave ||
      current.sourceId !== participant.id
    ) {
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  return { inserted, updated, unchanged };
}
