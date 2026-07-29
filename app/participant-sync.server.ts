import {
  demoParticipants,
  participantInitials,
  type Participant,
  type ParticipantResponse,
} from "./participants.ts";

type SourceRecord = Record<string, unknown>;

export type ParticipantFieldConfig = {
  listPath: string;
  bibField: string;
  nameField: string;
  categoryField: string;
  waveField: string;
  genderField: string;
  dateOfBirthField: string;
  clubField: string;
  statusField: string;
  idField: string;
};

type CacheEntry = ParticipantResponse;

let participantCache: CacheEntry | null = null;
let refreshInFlight: Promise<ParticipantResponse> | null = null;

function fieldConfigFromEnvironment(): ParticipantFieldConfig {
  return {
    listPath: process.env.PARTICIPANT_LIST_PATH ?? "",
    bibField: process.env.PARTICIPANT_BIB_FIELD ?? "bib",
    nameField: process.env.PARTICIPANT_NAME_FIELD ?? "name",
    categoryField: process.env.PARTICIPANT_CATEGORY_FIELD ?? "category",
    waveField: process.env.PARTICIPANT_WAVE_FIELD ?? "wave",
    genderField: process.env.PARTICIPANT_GENDER_FIELD ?? "Gender",
    dateOfBirthField: process.env.PARTICIPANT_DATE_OF_BIRTH_FIELD ?? "DateOfBirth",
    clubField: process.env.PARTICIPANT_CLUB_FIELD ?? "club",
    statusField: process.env.PARTICIPANT_STATUS_FIELD ?? "status",
    idField: process.env.PARTICIPANT_ID_FIELD ?? "id",
  };
}

function syncInterval() {
  const configured = Number(process.env.PARTICIPANT_SYNC_INTERVAL_MS ?? "60000");
  return Number.isFinite(configured) && configured >= 5000 ? configured : 60000;
}

export function valueAtPath(value: unknown, path: string): unknown {
  if (!path?.trim()) return value;
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

function sourceString(record: SourceRecord, field: string) {
  if (!field?.trim()) return "";
  const value = valueAtPath(record, field);
  return value == null ? "" : String(value).trim();
}

export function normalizeBib(value: unknown) {
  if (value == null) return null;
  const bib = String(value).trim();
  return /^\d+$/.test(bib) ? bib : null;
}

function normalizeStatus(value: unknown): Participant["status"] {
  const status = String(value ?? "").trim().toLowerCase();
  return ["on course", "on_course", "active", "assigned", "racing"].includes(status)
    ? "On course"
    : "Ready";
}

function normalizeDateOfBirth(value: string) {
  if (!value) return "";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  if (!iso) return "";
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? "" : iso;
}

export function normalizeParticipants(
  payload: unknown,
  config: ParticipantFieldConfig,
): { participants: Participant[]; rejectedCount: number } {
  const source = valueAtPath(payload, config.listPath);
  if (!Array.isArray(source)) throw new Error("Configured participant list is not an array");

  const candidates: Participant[] = [];
  let rejectedCount = 0;

  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      rejectedCount += 1;
      continue;
    }

    const record = item as SourceRecord;
    const bib = normalizeBib(valueAtPath(record, config.bibField));
    const name = sourceString(record, config.nameField);
    if (!bib || !name) {
      rejectedCount += 1;
      continue;
    }

    candidates.push({
      id: sourceString(record, config.idField) || bib,
      bib,
      name,
      category: sourceString(record, config.categoryField) || "Unassigned",
      wave: sourceString(record, config.waveField) || "Wave pending",
      gender: sourceString(record, config.genderField),
      dateOfBirth: normalizeDateOfBirth(sourceString(record, config.dateOfBirthField)),
      club: sourceString(record, config.clubField),
      avatar: participantInitials(name),
      status: normalizeStatus(valueAtPath(record, config.statusField)),
    });
  }

  const bibCounts = new Map<string, number>();
  for (const participant of candidates) {
    bibCounts.set(participant.bib, (bibCounts.get(participant.bib) ?? 0) + 1);
  }

  const participants = candidates.filter((participant) => {
    const unique = bibCounts.get(participant.bib) === 1;
    if (!unique) rejectedCount += 1;
    return unique;
  });

  return { participants, rejectedCount };
}

function demoResponse(): ParticipantResponse {
  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + syncInterval());
  return {
    participants: demoParticipants,
    sync: {
      source: "demo",
      fetchedAt: fetchedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      rejectedCount: 0,
      stale: false,
    },
  };
}

async function fetchParticipants(): Promise<ParticipantResponse> {
  const sourceUrl = process.env.PARTICIPANT_API_URL?.trim();
  if (!sourceUrl) return demoResponse();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(sourceUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Participant source returned HTTP ${response.status}`);

    const payload: unknown = await response.json();
    const { participants, rejectedCount } = normalizeParticipants(payload, fieldConfigFromEnvironment());
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + syncInterval());

    return {
      participants,
      sync: {
        source: "raceresult",
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        rejectedCount,
        stale: false,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getParticipantResponse(forceRefresh = false): Promise<ParticipantResponse> {
  const cacheIsFresh =
    participantCache && Date.parse(participantCache.sync.expiresAt) > Date.now();
  if (!forceRefresh && cacheIsFresh) return participantCache;

  if (!refreshInFlight) {
    refreshInFlight = fetchParticipants()
      .then((response) => {
        participantCache = response;
        return response;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  try {
    return await refreshInFlight;
  } catch (error) {
    if (participantCache) {
      return {
        ...participantCache,
        sync: { ...participantCache.sync, stale: true },
      };
    }
    throw error;
  }
}

export function resetParticipantCacheForTests() {
  participantCache = null;
  refreshInFlight = null;
}
