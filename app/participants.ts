export type Participant = {
  id: string;
  bib: string;
  name: string;
  category: string;
  wave: string;
  avatar: string;
  status: "Ready" | "On course";
};

export type ParticipantSync = {
  source: "raceresult" | "demo" | "device";
  fetchedAt: string;
  expiresAt: string;
  rejectedCount: number;
  stale: boolean;
};

export type ParticipantResponse = {
  participants: Participant[];
  sync: ParticipantSync;
};

export const demoParticipants: Participant[] = [
  { id: "25645", bib: "25645", name: "Riya Sharma", category: "Female Open", wave: "Wave 12 · 09:40", avatar: "RS", status: "Ready" },
  { id: "25646", bib: "25646", name: "Rishabh Shah", category: "Male Open", wave: "Wave 12 · 09:40", avatar: "RS", status: "Ready" },
  { id: "30821", bib: "30821", name: "Arjun Menon", category: "Male Pro", wave: "Wave 14 · 10:20", avatar: "AM", status: "Ready" },
  { id: "17204", bib: "17204", name: "Meera & Tara", category: "Female Doubles", wave: "Wave 08 · 08:20", avatar: "MT", status: "On course" },
  { id: "10483", bib: "10483", name: "Aarav Rao", category: "NextGen Boys", wave: "Wave 03 · 16:30", avatar: "AR", status: "Ready" },
];

export function participantInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "—";
}

export function searchParticipants(participants: Participant[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return participants.slice(0, 3);

  return participants
    .filter((participant) => `${participant.name} ${participant.bib}`.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      const leftExact = left.bib.toLowerCase() === normalizedQuery ? 1 : 0;
      const rightExact = right.bib.toLowerCase() === normalizedQuery ? 1 : 0;
      return rightExact - leftExact;
    });
}

export function parseScannedBib(value: string) {
  const bib = value.trim();
  return /^\d+$/.test(bib) ? bib : null;
}

export function findParticipantByScannedBib(participants: Participant[], value: string) {
  const bib = parseScannedBib(value);
  if (!bib) return null;
  return participants.find((participant) => participant.bib === bib) ?? null;
}
