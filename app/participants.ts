export type Participant = {
  id: string;
  bib: string;
  name: string;
  category: string;
  contestId: string;
  wave: string;
  gender: string;
  dateOfBirth: string;
  club: string;
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
  { id: "25645", bib: "25645", name: "Riya Sharma", category: "Female Open", contestId: "5", wave: "Wave 12 · 09:40", gender: "Female", dateOfBirth: "2005-02-18", club: "", avatar: "RS", status: "Ready" },
  { id: "25646", bib: "25646", name: "Rishabh Shah", category: "Male Open", contestId: "6", wave: "Wave 12 · 09:40", gender: "Male", dateOfBirth: "2003-11-02", club: "", avatar: "RS", status: "Ready" },
  { id: "30821", bib: "30821", name: "Arjun Menon", category: "Male Pro", contestId: "7", wave: "Wave 14 · 10:20", gender: "Male", dateOfBirth: "2001-06-23", club: "", avatar: "AM", status: "Ready" },
  { id: "17204", bib: "17204", name: "Meera Iyer", category: "Female Doubles", contestId: "8", wave: "Wave 08 · 08:20", gender: "Female", dateOfBirth: "2004-04-12", club: "Rapid Racers", avatar: "MI", status: "On course" },
  { id: "10483", bib: "10483", name: "Aarav Rao", category: "NextGen Boys", contestId: "1", wave: "Wave 03 · 16:30", gender: "Male", dateOfBirth: "2010-09-08", club: "", avatar: "AR", status: "Ready" },
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
