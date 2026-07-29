"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { colorChoices, colorSequence, scoreSequence, type ColorKey } from "./cognitive-sequence";
import QrScanner from "./qr-scanner";
import {
  penaltyFields,
  stationPenaltyField,
  upsertPenaltyOperation,
  type PenaltyField,
  type PenaltyFieldState,
  type PenaltyOperation,
} from "./penalties";
import {
  demoParticipants,
  findParticipantByScannedBib,
  parseScannedBib,
  searchParticipants,
  type Participant,
  type ParticipantResponse,
  type ParticipantSync,
} from "./participants";

type Screen =
  | "login"
  | "event"
  | "search"
  | "brief"
  | "sequence"
  | "race"
  | "recall"
  | "finish"
  | "history";

const stations = [
  "Dumbbell Step-Ups",
  "Farmer’s Carry",
  "Bear Crawl",
  "Burpees to Plate",
  "Front Carry + Air Squats",
  "Tyre Flips",
];

const sequenceLength = colorSequence.length;
const participantSnapshotKey = "hyfit-games-participant-snapshot-v1";
const penaltyOutboxKey = "hyfit-games-penalty-outbox-v1";
const judgedAthletesKey = "hyfit-games-judged-athletes-v1";

type JudgedAthlete = {
  id: string;
  judgeId: string;
  athlete: Participant;
  completedAt: string;
  penalties: number[];
  notes: string[];
  cognitiveScore: number;
  cognitivePenalty: number;
  totalPenalty: number;
  savedAt: Partial<Record<PenaltyField, string>>;
};

function operationId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadParticipantSnapshot(): ParticipantResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(participantSnapshotKey);
    if (!saved) return null;
    const snapshot = JSON.parse(saved) as ParticipantResponse;
    return Array.isArray(snapshot.participants) && snapshot.participants.length && snapshot.sync
      ? snapshot
      : null;
  } catch {
    localStorage.removeItem(participantSnapshotKey);
    return null;
  }
}

const stepLabels = ["Start", ...stations, "Recall", "Finish"];

function SequenceTile({
  colorKey,
  index,
  match,
}: {
  colorKey: ColorKey;
  index: number;
  match?: boolean;
}) {
  const choice = colorChoices[colorKey];
  const status = match === undefined ? undefined : match ? "Correct" : "Incorrect";

  return (
    <div
      className={`sequence-tile${status ? ` ${match ? "correct" : "incorrect"}` : ""}`}
      style={{ "--tile-color": choice.color, "--tile-text": choice.textColor } as React.CSSProperties}
      aria-label={`Position ${index + 1}: ${choice.label}${status ? `, ${status}` : ""}`}
    >
      <small>{index + 1}</small>
      <strong>{choice.key}</strong>
      {status && <span className="match-marker" aria-hidden="true">{match ? "✓" : "×"}</span>}
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("login");
  const [judgeId, setJudgeId] = useState("");
  const [judgePin, setJudgePin] = useState("");
  const [query, setQuery] = useState("");
  const [participants, setParticipants] = useState<Participant[]>(demoParticipants);
  const [participantSync, setParticipantSync] = useState<ParticipantSync | null>(null);
  const [syncingParticipants, setSyncingParticipants] = useState(false);
  const [participantSyncError, setParticipantSyncError] = useState("");
  const [athlete, setAthlete] = useState<Participant>(demoParticipants[0]);
  const [station, setStation] = useState(0);
  const [furthestStation, setFurthestStation] = useState(0);
  const [penalties, setPenalties] = useState<number[]>(Array(6).fill(0));
  const [notes, setNotes] = useState<string[]>(Array(6).fill(""));
  const [recall, setRecall] = useState<ColorKey[]>([]);
  const [recallPenalty, setRecallPenalty] = useState(0);
  const [seconds, setSeconds] = useState(10);
  const [online, setOnline] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [toast, setToast] = useState("");
  const [penaltyOutbox, setPenaltyOutbox] = useState<PenaltyOperation[]>([]);
  const [penaltyFieldState, setPenaltyFieldState] = useState<Partial<Record<PenaltyField, PenaltyFieldState>>>({});
  const [judgedAthletes, setJudgedAthletes] = useState<JudgedAthlete[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<JudgedAthlete | null>(null);
  const [historyReturnScreen, setHistoryReturnScreen] = useState<Screen>("event");
  const [finalizing, setFinalizing] = useState(false);
  const [returnToRecall, setReturnToRecall] = useState(false);
  const penaltyOutboxRef = useRef(penaltyOutbox);
  const penaltyFieldStateRef = useRef(penaltyFieldState);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const restoreSnapshot = window.setTimeout(() => {
      const snapshot = loadParticipantSnapshot();
      if (!snapshot) return;
      setParticipants(snapshot.participants);
      setParticipantSync({ ...snapshot.sync, source: "device", stale: true });
    }, 0);
    return () => window.clearTimeout(restoreSnapshot);
  }, []);

  useEffect(() => {
    const restorePenaltyData = window.setTimeout(() => {
      try {
        const savedOutbox = JSON.parse(localStorage.getItem(penaltyOutboxKey) ?? "[]") as PenaltyOperation[];
        const savedHistory = JSON.parse(localStorage.getItem(judgedAthletesKey) ?? "[]") as JudgedAthlete[];
        if (Array.isArray(savedOutbox)) setPenaltyOutbox(savedOutbox);
        if (Array.isArray(savedHistory)) setJudgedAthletes(savedHistory);
      } catch {
        localStorage.removeItem(penaltyOutboxKey);
        localStorage.removeItem(judgedAthletesKey);
      }
    }, 0);
    return () => window.clearTimeout(restorePenaltyData);
  }, []);

  useEffect(() => {
    penaltyOutboxRef.current = penaltyOutbox;
    localStorage.setItem(penaltyOutboxKey, JSON.stringify(penaltyOutbox));
  }, [penaltyOutbox]);

  useEffect(() => {
    penaltyFieldStateRef.current = penaltyFieldState;
  }, [penaltyFieldState]);

  useEffect(() => {
    localStorage.setItem(judgedAthletesKey, JSON.stringify(judgedAthletes));
  }, [judgedAthletes]);

  useEffect(() => {
    if (screen !== "sequence" || seconds <= 0) return;
    const t = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [screen, seconds]);

  useEffect(() => {
    if (!["race", "recall", "finish"].includes(screen)) return;
    localStorage.setItem(
      "hyfit-games-active-race",
      JSON.stringify({ athlete, station, furthestStation, penalties, notes, recall, recallPenalty, penaltyFieldState, updatedAt: Date.now() }),
    );
  }, [athlete, station, furthestStation, penalties, notes, recall, recallPenalty, penaltyFieldState, screen]);

  const refreshParticipants = useCallback(async (forceRefresh = false) => {
    setSyncingParticipants(true);
    setParticipantSyncError("");
    try {
      const response = await fetch(`/api/participants${forceRefresh ? "?refresh=1" : ""}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Participant sync failed with HTTP ${response.status}`);
      const snapshot = await response.json() as ParticipantResponse;
      if (!Array.isArray(snapshot.participants) || !snapshot.sync) throw new Error("Invalid participant response");
      setParticipants(snapshot.participants);
      setParticipantSync(snapshot.sync);
      localStorage.setItem(participantSnapshotKey, JSON.stringify(snapshot));
    } catch {
      setParticipantSyncError("Sync unavailable · using last saved participants");
      setParticipantSync((current) => current ? { ...current, stale: true } : null);
    } finally {
      setSyncingParticipants(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== "search") return;
    const initialRefresh = window.setTimeout(() => void refreshParticipants(), 0);
    const interval = window.setInterval(() => void refreshParticipants(), 60000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refreshParticipants, screen]);

  const filtered = useMemo(
    () => searchParticipants(participants, query),
    [participants, query],
  );

  const { correctCount, percentage: score } = useMemo(() => scoreSequence(recall), [recall]);
  const recallComplete = recall.length === sequenceLength;
  const stationTotal = penalties.reduce((a, b) => a + b, 0);
  const total = stationTotal + recallPenalty;

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function login() {
    if (!judgeId.trim()) return flash("Enter your Judge, Volunteer or Mobile ID");
    if (!judgePin.trim()) return flash("Enter your PIN");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ staffId: judgeId, pin: judgePin, deviceLabel: navigator.userAgent }),
      });
      const data = await response.json() as { user?: { role: string }; error?: string };
      if (!response.ok) return flash(data.error ?? "Sign in failed");
      if (!data.user || !["judge","event_admin","super_admin"].includes(data.user.role)) return flash("This account is not assigned to judging");
      setScreen("event");
    } catch {
      flash("Local event server is unavailable");
    }
  }

  function chooseAthlete(p: Participant) {
    if (p.status === "On course") return flash("Already assigned. Ask the Control Desk to reassign.");
    setAthlete(p);
    setScreen("brief");
  }

  const handleQrScan = useCallback(async (value: string) => {
    try {
      const response = await fetch(`/api/judge/resolve?code=${encodeURIComponent(value.trim())}`);
      const data = await response.json() as { participant?: Participant; error?: string };
      if (!response.ok || !data.participant) return data.error ?? "Wristband could not be resolved";
      if (data.participant.status === "On course") return `BIB ${data.participant.bib} is already on course. Ask Event Control to reassign.`;
      setAthlete(data.participant);
      setShowQrScanner(false);
      setScreen("brief");
      return null;
    } catch {
      const bib = parseScannedBib(value);
      const participant = bib ? findParticipantByScannedBib(participants, bib) : null;
      if (!participant) return "Local server unavailable and this code cannot be matched from the saved roster.";
      setAthlete(participant); setShowQrScanner(false); setScreen("brief"); return null;
    }
  }, [participants]);

  async function claimAthlete() {
    try {
      const response = await fetch("/api/judge/claim", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ participantId: athlete.id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) return flash(data.error ?? "Athlete could not be assigned");
      setScreen("sequence");
    } catch {
      flash("Local event server is unavailable");
    }
  }

  function setPenalty(value: number) {
    setPenalties((current) => current.map((p, i) => (i === station ? value : p)));
    const fieldName = stationPenaltyField(station);
    setPenaltyFieldState((current) => ({
      ...current,
      [fieldName]: { value, status: "draft" },
    }));
  }

  const submitPenaltyOperation = useCallback(async (operation: PenaltyOperation) => {
    try {
      const response = await fetch("/api/penalties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(operation),
      });
      if (!response.ok) throw new Error(`Penalty update failed with HTTP ${response.status}`);
      const saved = await response.json() as {
        operationId: string;
        savedAt: string;
        deliveryState?: "confirmed" | "pending" | "conflict";
      };
      const isCurrent = penaltyOutboxRef.current.some((item) => item.operationId === saved.operationId);
      if (!isCurrent) return true;

      const confirmed = saved.deliveryState !== "pending" && saved.deliveryState !== "conflict";
      if (confirmed) {
        setPenaltyOutbox((current) => {
          const next = current.filter((item) => item.operationId !== saved.operationId);
          penaltyOutboxRef.current = next;
          return next;
        });
      }
      setPenaltyFieldState((current) => {
        const next = {
          ...current,
          [operation.fieldName]: confirmed
            ? { value: operation.value, status: "saved" as const, savedAt: saved.savedAt }
            : {
                value: operation.value,
                status: saved.deliveryState === "conflict" ? "failed" as const : "pending" as const,
              },
        };
        penaltyFieldStateRef.current = next;
        return next;
      });
      return true;
    } catch {
      setPenaltyOutbox((current) => {
        const next = current.map((item) => item.operationId === operation.operationId
          ? { ...item, attemptCount: item.attemptCount + 1, lastError: "Sync failed" }
          : item);
        penaltyOutboxRef.current = next;
        return next;
      });
      setPenaltyFieldState((current) => {
        const currentField = current[operation.fieldName];
        if (currentField?.value !== operation.value) return current;
        const next = {
          ...current,
          [operation.fieldName]: { value: operation.value, status: "failed" as const },
        };
        penaltyFieldStateRef.current = next;
        return next;
      });
      return false;
    }
  }, []);

  const savePenaltyValue = useCallback((fieldName: PenaltyField, value: number) => {
    const operation: PenaltyOperation = {
      operationId: operationId(),
      bib: athlete.bib,
      fieldName,
      value,
      createdAt: new Date().toISOString(),
      attemptCount: 0,
    };
    setPenaltyOutbox((current) => {
      const next = upsertPenaltyOperation(current, operation);
      penaltyOutboxRef.current = next;
      return next;
    });
    setPenaltyFieldState((current) => {
      const next = { ...current, [fieldName]: { value, status: "pending" as const } };
      penaltyFieldStateRef.current = next;
      return next;
    });
    return submitPenaltyOperation(operation);
  }, [athlete.bib, submitPenaltyOperation]);

  const retryPenaltyOutbox = useCallback(async () => {
    const pending = [...penaltyOutboxRef.current];
    if (!pending.length) return;
    await Promise.all(pending.map((operation) => submitPenaltyOperation(operation)));
  }, [submitPenaltyOperation]);

  useEffect(() => {
    const retry = () => void retryPenaltyOutbox();
    window.addEventListener("online", retry);
    const interval = window.setInterval(retry, 15000);
    return () => {
      window.removeEventListener("online", retry);
      window.clearInterval(interval);
    };
  }, [retryPenaltyOutbox]);

  function nextStation() {
    const savedStation = station;
    void savePenaltyValue(stationPenaltyField(savedStation), penalties[savedStation]);
    if (returnToRecall) {
      setReturnToRecall(false);
      setScreen("recall");
      return;
    }
    if (savedStation < 5) {
      const nextFurthest = Math.max(furthestStation, savedStation + 1);
      setFurthestStation(nextFurthest);
      setStation(savedStation < furthestStation ? furthestStation : savedStation + 1);
    } else {
      setScreen("recall");
    }
  }

  function revokeCurrentPenalty() {
    const savedStation = station;
    setPenalties((current) => current.map((value, index) => index === savedStation ? 0 : value));
    void savePenaltyValue(stationPenaltyField(savedStation), 0);
    flash(`Station ${savedStation + 1} penalty revoked · syncing value 0`);
  }

  async function finishRecall() {
    setFinalizing(true);
    const cognitiveAccepted = await savePenaltyValue("cognitiveskillpenalty", recallPenalty);
    await retryPenaltyOutbox();
    if (!cognitiveAccepted) {
      setFinalizing(false);
      flash("Final Finish is waiting for the local event server");
      return;
    }

    try {
      const finishResponse = await fetch("/api/judge/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bib: athlete.bib, totalPenalty: total }),
      });
      if (!finishResponse.ok) {
        const data = await finishResponse.json() as { error?: string };
        setFinalizing(false);
        flash(data.error ?? "Final Finish could not be locked centrally");
        return;
      }
    } catch {
      setFinalizing(false);
      flash("Final Finish is waiting for the local event server");
      return;
    }

    const completedAt = new Date().toISOString();
    const savedAt = Object.fromEntries(
      penaltyFields.map((fieldName) => [fieldName, penaltyFieldStateRef.current[fieldName]?.savedAt]),
    ) as Partial<Record<PenaltyField, string>>;
    const completed: JudgedAthlete = {
      id: `${athlete.id}-${completedAt}`,
      judgeId,
      athlete,
      completedAt,
      penalties,
      notes,
      cognitiveScore: score,
      cognitivePenalty: recallPenalty,
      totalPenalty: total,
      savedAt,
    };
    setJudgedAthletes((current) => [completed, ...current]);
    setScreen("finish");
    setFinalizing(false);
  }

  function resetDemo() {
    localStorage.removeItem("hyfit-games-active-race");
    setScreen("login");
    setJudgeId("");
    setQuery("");
    setStation(0);
    setFurthestStation(0);
    setPenalties(Array(6).fill(0));
    setNotes(Array(6).fill(""));
    setRecall([]);
    setRecallPenalty(0);
    setPenaltyFieldState({});
    penaltyFieldStateRef.current = {};
    setReturnToRecall(false);
    setSeconds(10);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => screen === "login" || flash("Race is locked while judging")}>
          <Image className="brand-logo" src="/branding/hyfit-games-logo.png" alt="HYFIT Games — Run. Lift. Live." width={68} height={68} priority unoptimized />
          <span><b>HYFIT GAMES</b><small>JUDGE APP</small></span>
        </button>
        {screen !== "login" && (
          <div className="top-actions">
            <div className={`sync-pill ${online ? "" : "offline"}`}>
              <span className="pulse" /> {online ? "Synced" : "Offline · saving"}
            </div>
            <button className="icon-btn" aria-label="Help" onClick={() => setShowHelp(true)}>?</button>
          </div>
        )}
      </header>

      {screen === "login" && (
        <section className="login-grid">
          <div className="login-copy">
            <div className="eyebrow"><span /> FIELD OPERATIONS · 2026</div>
            <h1>Judge with<br/><em>confidence.</em></h1>
            <p>A fast, resilient field console built for every rep, every penalty and every athlete.</p>
            <div className="trust-row">
              <span>◉ Offline ready</span><span>⌁ Auto-saved</span><span>✓ Audit trail</span>
            </div>
          </div>
          <div className="login-card">
            <div className="card-kicker">SECURE ACCESS</div>
            <h2>Welcome, Judge</h2>
            <p>Enter any ID assigned to you by the Control Desk.</p>
            <label>JUDGE / VOLUNTEER / MOBILE ID</label>
            <div className="field">
              <span>⌁</span>
              <input value={judgeId} onChange={(e) => setJudgeId(e.target.value)} placeholder="e.g. JUDGE1" autoFocus />
            </div>
            <label>SECURE PIN</label>
            <div className="field">
              <span>••</span>
              <input type="password" inputMode="numeric" value={judgePin} onChange={(e) => setJudgePin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void login()} placeholder="4–8 digit PIN" />
            </div>
            <button className="primary" onClick={() => void login()}>Continue <span>→</span></button>
            <div className="demo-note">Local demo: JUDGE1 / 2468</div>
            <button className="text-btn" onClick={() => setShowHelp(true)}>Can’t access your account?</button>
          </div>
        </section>
      )}

      {screen !== "login" && (
        <div className="workspace">
          <aside>
            <div className="judge-chip"><span>AL</span><div><b>Arul Lakshmanan</b><small>{judgeId.toUpperCase()} · Floor Judge</small></div></div>
            <nav>
              <button className={screen === "event" ? "active" : ""}>⌂ <span>Events</span></button>
              <button className={["search","brief","sequence","race","recall","finish"].includes(screen) ? "active" : ""} onClick={() => screen === "history" && setScreen(historyReturnScreen)}>◎ <span>Active race</span></button>
              <button className={screen === "history" ? "active" : ""} onClick={() => { if (screen !== "history") setHistoryReturnScreen(screen); setSelectedHistory(null); setScreen("history"); }}>✓ <span>Judged athletes</span><i>{judgedAthletes.length}</i></button>
              <button>↻ <span>Pending sync</span><i>{penaltyOutbox.length}</i></button>
            </nav>
            <div className="side-status"><span className={online ? "live-dot" : "amber-dot"} /><div><b>{online ? "All systems normal" : "Offline mode active"}</b><small>{online ? "Last sync just now" : "Changes stay on this device"}</small></div></div>
          </aside>

          <section className="content">
            {screen === "event" && (
              <>
                <div className="page-heading"><div><div className="eyebrow">TODAY · DAY 1 OF 4</div><h2>Choose your event</h2><p>Only events assigned to your judge profile are shown.</p></div><div className="clock">09:36<small>27 JUL · BENGALURU</small></div></div>
                <div className="event-grid">
                  <button className="event-card featured" onClick={() => setScreen("search")}>
                    <div className="event-top"><span>LIVE</span><i>Open</i></div>
                    <Image className="event-logo" src="/branding/hyfit-games-logo.png" alt="HYFIT Games — Run. Lift. Live." width={112} height={112} unoptimized />
                    <h3>HYFIT Games Bengaluru</h3>
                    <p>Hall A · Manpho Convention Centre</p>
                    <div className="event-stats"><span><b>4,982</b> Athletes</span><span><b>24</b> Active waves</span></div>
                    <div className="event-cta">Enter event <span>→</span></div>
                  </button>
                  <div className="event-card muted">
                    <div className="event-top"><span className="later">UP NEXT</span><i>Tomorrow</i></div>
                    <Image className="event-logo ghost" src="/branding/hyfit-games-logo.png" alt="HYFIT Games — Run. Lift. Live." width={112} height={112} unoptimized /><h3>HYFIT Games Bengaluru</h3><p>Day 2 · Starts 07:00</p>
                    <div className="event-cta disabled">Available tomorrow</div>
                  </div>
                </div>
                <div className="brief-strip"><b>Before your shift</b><span>Complete the 3-minute judge safety briefing.</span><button onClick={() => flash("Briefing marked complete")}>Review briefing →</button></div>
              </>
            )}

            {screen === "search" && (
              <>
                <button className="back" onClick={() => setScreen("event")}>← All events</button>
                <div className="page-heading compact"><div><div className="eyebrow">HYFIT GAMES · DAY 1</div><h2>Find your athlete</h2><p>Search by BIB or participant name, then verify before pairing.</p></div><div className="assignment"><b>Judge station</b><span>Mobile · Athlete follow</span></div></div>
                <div className="participant-search-actions">
                  <div className="search-box"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search BIB or participant name…" autoFocus/><kbd>⌘ K</kbd></div>
                  <button className="scan-qr-btn" onClick={() => setShowQrScanner(true)}><span aria-hidden="true">▦</span><b>Scan wristband QR</b><small>Numeric BIB only</small></button>
                </div>
                <div className={`participant-sync ${participantSync?.stale || participantSyncError ? "stale" : ""}`}>
                  <div><span className={participantSync?.stale || participantSyncError ? "amber-dot" : "live-dot"} /><b>{participantSyncError || (participantSync?.source === "demo" ? "Demo participants" : participantSync?.stale ? "Saved participant snapshot" : "Live participants")}</b><small>{participantSync ? `Last synced ${new Date(participantSync.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${participants.length} athletes${participantSync.rejectedCount ? ` · ${participantSync.rejectedCount} rejected` : ""}` : "Preparing participant data…"}</small></div>
                  <button disabled={syncingParticipants} onClick={() => void refreshParticipants(true)}>{syncingParticipants ? "Syncing…" : "↻ Sync now"}</button>
                </div>
                <div className="result-head"><span>{query ? `${filtered.length} MATCHES` : "UPCOMING IN YOUR WAVE"}</span><small>Tap a participant to verify</small></div>
                <div className="athlete-list">
                  {filtered.map((p) => <button key={p.bib} className="athlete-row" onClick={() => chooseAthlete(p)}>
                    <span className="avatar">{p.avatar}</span><span className="athlete-main"><b>{p.name}</b><small>{p.category} · {p.wave}</small></span><span className="bib">{p.bib}</span><span className={`status ${p.status === "Ready" ? "" : "busy"}`}>{p.status}</span><i>›</i>
                  </button>)}
                </div>
                <div className="fallback">Participant not found? <button onClick={() => flash("Control Desk notified with your device ID")}>Alert Control Desk</button> or scan the printed BIB list.</div>
              </>
            )}

            {screen === "brief" && (
              <div className="focus-wrap">
                <button className="back" onClick={() => setScreen("search")}>← Change athlete</button>
                <div className="verify-card">
                  <div className="verify-top"><span className="avatar large">{athlete.avatar}</span><div><div className="eyebrow">VERIFY WITH ATHLETE</div><h2>{athlete.name}</h2><p>{athlete.category} · {athlete.wave}</p></div><div className="big-bib"><small>BIB</small>{athlete.bib}</div></div>
                  <div className="checks"><span>✓ Name confirmed</span><span>✓ BIB visible & matches</span><span>✓ Athlete ready</span></div>
                  <div className="warning"><b>One judge · one athlete</b><span>This assignment locks when you start the sequence. Reassignment needs Control Desk approval.</span></div>
                  <button className="primary" onClick={() => void claimAthlete()}>Pair & begin cognitive sequence <span>→</span></button>
                </div>
              </div>
            )}

            {screen === "sequence" && (
              <div className="sequence-screen">
                <div className="race-meta"><span>{athlete.bib} · {athlete.name}</span><b>STEP 0 OF 8</b></div>
                <div className="sequence-head"><div className="eyebrow">COGNITIVE SEQUENCE</div><h2>Memorise the colour order</h2><p>Show this screen to the athlete. The sequence hides when the timer ends.</p></div>
                {seconds > 0 ? <div className="sequence-row memorise-row" aria-label="Sequence to memorise">{colorSequence.map((colorKey, index) => <SequenceTile key={index} colorKey={colorKey} index={index} />)}</div> : <div className="sequence-hidden"><span>✓</span><b>Sequence hidden</b><small>Do not show it again to the athlete.</small></div>}
                <div className="timer-line"><div className="timer-ring">{seconds}<small>SEC</small></div><div className="timer-copy"><b>{seconds ? "Memorisation in progress" : "Ready to start"}</b><span>{seconds ? "Sequence will hide automatically" : "Confirm athlete is at the start line"}</span></div></div>
                <button className="primary wide" disabled={seconds > 0} onClick={() => setScreen("race")}>Start race & lock sequence <span>→</span></button>
                <button className="text-btn" onClick={() => { setSeconds(10); flash("Timer restarted and action logged"); }}>Restart timer (logged)</button>
              </div>
            )}

            {screen === "race" && (
              <>
                <div className="race-header">
                  <div><div className="eyebrow">ATHLETE ON COURSE</div><h2>{athlete.name} <span>{athlete.bib}</span></h2></div>
                  <div className="race-total"><small>TOTAL PENALTY</small><b>+{stationTotal}s</b></div>
                </div>
                <div className="progress">{stepLabels.map((label, index) => {
                  const stationIndex = index - 1;
                  const accessible = index >= 1 && index <= 6 && stationIndex <= furthestStation;
                  const current = index === station + 1;
                  const done = index === 0 || (index >= 1 && index <= 6 && stationIndex < furthestStation);
                  return <button key={label} className={current ? "current" : done ? "done" : ""} disabled={!accessible} onClick={() => accessible && setStation(stationIndex)}><i>{done && !current ? "✓" : index}</i><span>{label}</span></button>;
                })}</div>
                <div className="station-layout">
                  <div className="station-card">
                    <div className="station-number">STATION {station + 1} OF 6 <span className={`field-sync ${penaltyFieldState[stationPenaltyField(station)]?.status ?? "draft"}`}>{penaltyFieldState[stationPenaltyField(station)]?.status === "saved" ? "✓ RaceResult confirmed" : penaltyFieldState[stationPenaltyField(station)]?.status === "pending" ? "↻ Offline · retrying" : penaltyFieldState[stationPenaltyField(station)]?.status === "failed" ? "! Sync needs attention" : "Draft"}</span></div>
                    <h3>{stations[station]}</h3>
                    <p>200 m run completed · Observe the full movement standard.</p>
                    <div className="quick-label"><b>Penalty</b><span>Add seconds only for an observed violation</span></div>
                    <div className="penalty-pills">{[0,5,10,15,20,30].map((v) => <button key={v} className={penalties[station] === v ? "active" : ""} onClick={() => setPenalty(v)}>{v === 0 ? "No penalty" : `+${v}s`}</button>)}</div>
                    <div className="custom-penalty"><label>Custom seconds</label><input type="number" min="0" max="300" value={penalties[station]} onChange={(e) => setPenalty(Math.max(0, Number(e.target.value)))} /></div>
                    <label className="notes-label">Judge note <small>Optional · useful for reviews</small></label>
                    <textarea value={notes[station]} onChange={(e) => setNotes((n) => n.map((x,i) => i === station ? e.target.value : x))} placeholder="e.g. 2 incomplete reps after warning…" />
                    {penalties[station] > 0 && <button className="revoke-btn" onClick={revokeCurrentPenalty}>Revoke penalty · save 0 seconds</button>}
                    <button className="primary" onClick={nextStation}>Save & {returnToRecall ? "return to cognitive recall" : station === 5 ? "begin recall" : station < furthestStation ? `return to station ${furthestStation + 1}` : "continue to 200 m run"} <span>→</span></button>
                  </div>
                  <aside className="standard-card"><div className="standard-icon">◎</div><h4>Movement standard</h4><p>Watch for complete range of motion, correct load and station boundary.</p><ul><li>Give one clear verbal warning</li><li>Apply only published penalties</li><li>Use a note for disputed calls</li></ul><button onClick={() => setShowHelp(true)}>View station rules</button></aside>
                </div>
              </>
            )}

            {screen === "recall" && (
              <div className="recall-wrap">
                <div className="race-meta"><span>{athlete.bib} · {athlete.name}</span><b>COGNITIVE RECALL</b></div>
                <div className="station-review"><span>Review station penalties</span><div>{stations.map((_, index) => <button key={index} onClick={() => { setStation(index); setReturnToRecall(true); setScreen("race"); }}>{index + 1}<small>+{penalties[index]}s</small></button>)}</div></div>
                <div className="sequence-head"><div className="eyebrow">FINAL CHALLENGE</div><h2>Recreate the colour order</h2><p>Ask the athlete to call out each colour. Tap in the same order.</p></div>
                <div className="recall-slots" aria-label="Athlete response">{colorSequence.map((_, index) => {
                  const answer = recall[index];
                  const choice = answer ? colorChoices[answer] : undefined;
                  return <button key={index} className={answer ? "filled" : ""} style={choice ? { "--tile-color": choice.color, "--tile-text": choice.textColor } as React.CSSProperties : undefined} aria-label={answer ? `Remove position ${index + 1}, ${choice?.label}` : `Position ${index + 1}, empty`} onClick={() => answer && setRecall((current) => current.filter((_, answerIndex) => answerIndex !== index))}><small>{index + 1}</small><strong>{answer ?? "—"}</strong></button>;
                })}</div>
                <div className="colour-controls">{Object.values(colorChoices).map((choice) => <button key={choice.key} style={{"--color":choice.color} as React.CSSProperties} onClick={() => recall.length < sequenceLength && setRecall((current) => [...current, choice.key])}><i />{choice.label} <b>{choice.key}</b></button>)}<button onClick={() => setRecall((current) => current.slice(0,-1))}>⌫ Undo</button></div>
                {recallComplete && <section className="comparison-panel" aria-live="polite">
                  <div className="comparison-heading"><div><div className="eyebrow">SEQUENCE REVEAL</div><h3>Position-by-position result</h3></div><div className={`score-summary ${score >= 60 ? "pass" : "fail"}`}><b>{correctCount} / {sequenceLength}</b><span>correct · {score}%</span></div></div>
                  <div className="comparison-group"><div className="comparison-label"><b>Original sequence</b><span>The sequence shown at the start</span></div><div className="sequence-row compact">{colorSequence.map((colorKey, index) => <SequenceTile key={index} colorKey={colorKey} index={index} />)}</div></div>
                  <div className="comparison-group"><div className="comparison-label"><b>Athlete response</b><span>Checks show exact positional matches</span></div><div className="sequence-row compact">{recall.map((colorKey, index) => <SequenceTile key={index} colorKey={colorKey} index={index} match={colorKey === colorSequence[index]} />)}</div></div>
                  <div className={`score-card ${score >= 60 ? "pass" : "fail"}`}><div><small>MATCH SCORE</small><b>{score}%</b></div><span>{score >= 60 ? "✓ Passed · no cognitive penalty" : "Needs penalty · score below 60%"}</span></div>
                </section>}
                {recallComplete && score < 60 && <div className="recall-penalty"><label>Cognitive penalty</label><div>{[30,60,90].map(v => <button className={recallPenalty === v ? "active":""} key={v} onClick={() => setRecallPenalty(v)}>+{v}s</button>)}</div></div>}
                {!!penaltyOutbox.length && <div className="sync-warning"><div><b>{penaltyOutbox.length} RaceResult update{penaltyOutbox.length === 1 ? "" : "s"} pending</b><span>Saved locally · retrying automatically when RR14 is reachable.</span></div></div>}
                <button className="primary wide" disabled={finalizing || !recallComplete || (score < 60 && recallPenalty === 0)} onClick={() => void finishRecall()}>{finalizing ? "Syncing final result…" : "Confirm recall & Final Finish"} <span>→</span></button>
              </div>
            )}

            {screen === "history" && (
              <div className="history-wrap">
                <button className="back" onClick={() => { setSelectedHistory(null); setScreen(historyReturnScreen); }}>← Back</button>
                <div className="page-heading compact"><div><div className="eyebrow">READ-ONLY HISTORY</div><h2>Judged athletes</h2><p>Completed results saved on this device. Final penalties cannot be edited.</p></div></div>
                {selectedHistory ? <div className="history-detail">
                  <button className="back" onClick={() => setSelectedHistory(null)}>← All judged athletes</button>
                  <div className="result-athlete"><span className="avatar large">{selectedHistory.athlete.avatar}</span><div><b>{selectedHistory.athlete.name}</b><span>BIB {selectedHistory.athlete.bib} · {selectedHistory.athlete.category}</span></div><div className="history-lock">🔒 READ ONLY</div></div>
                  <div className="history-penalties">{selectedHistory.penalties.map((value, index) => <div key={index}><span>Station {index + 1} · {stations[index]}</span><b>+{value}s</b><small>{selectedHistory.savedAt[stationPenaltyField(index)] ? `RR14 confirmed ${new Date(selectedHistory.savedAt[stationPenaltyField(index)]!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "RR14 sync pending at finish"}</small></div>)}<div><span>Cognitive skill · {selectedHistory.cognitiveScore}%</span><b>+{selectedHistory.cognitivePenalty}s</b><small>{selectedHistory.savedAt.cognitiveskillpenalty ? `RR14 confirmed ${new Date(selectedHistory.savedAt.cognitiveskillpenalty).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "RR14 sync pending at finish"}</small></div></div>
                  <div className="history-total"><span>Total submitted penalty</span><b>+{selectedHistory.totalPenalty}s</b></div>
                </div> : <div className="athlete-list">{judgedAthletes.length ? judgedAthletes.map((result) => <button key={result.id} className="athlete-row" onClick={() => setSelectedHistory(result)}><span className="avatar">{result.athlete.avatar}</span><span className="athlete-main"><b>{result.athlete.name}</b><small>BIB {result.athlete.bib} · {new Date(result.completedAt).toLocaleString()}</small></span><span className="bib">+{result.totalPenalty}s</span><span className="status">Saved</span><i>›</i></button>) : <div className="history-empty">No completed athletes on this device yet.</div>}</div>}
              </div>
            )}

            {screen === "finish" && (
              <div className="finish-wrap">
                <div className="success-mark">✓</div><div className="eyebrow">JUDGING COMPLETE</div><h2>Result locked.</h2><p>{athlete.name} is clear to cross the finish line.</p>
                <div className="result-card">
                  <div className="result-athlete"><span className="avatar large">{athlete.avatar}</span><div><b>{athlete.name}</b><span>{athlete.bib} · {athlete.category}</span></div></div>
                  <div className="result-metrics"><div><small>STATIONS</small><b>+{stationTotal}s</b></div><div><small>RECALL · {score}%</small><b>+{recallPenalty}s</b></div><div className="grand"><small>TOTAL PENALTY</small><b>+{total}s</b></div></div>
                  <div className="result-sync"><span className="live-dot" /><b>{online ? "Submitted to Race Control" : "Saved on device · will submit automatically"}</b><small>Audit ID HF-26-{athlete.bib.replace("-","")} · {new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small></div>
                </div>
                <div className="finish-actions"><button className="primary" onClick={resetDemo}>Judge next athlete <span>→</span></button><button className="secondary" onClick={() => window.print()}>Print / save summary</button></div>
              </div>
            )}
          </section>
        </div>
      )}

      {showHelp && <div className="modal-backdrop" onClick={() => setShowHelp(false)}><div className="help-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShowHelp(false)}>×</button><div className="help-icon">!</div><h3>Field support</h3><p>Never abandon an active athlete. Your entries auto-save on this device, even without internet.</p><div className="help-options"><button onClick={() => flash("Control Desk alerted")}>Alert Control Desk <span>High priority →</span></button><button onClick={() => flash("Offline recovery check complete")}>Recover active race <span>From this device →</span></button><button onClick={() => flash("Incident reference created")}>Report device issue <span>Creates audit record →</span></button></div><small>Emergency fallback: note the BIB, station and penalty on the printed judge card.</small></div></div>}
      {showQrScanner && <QrScanner onClose={() => setShowQrScanner(false)} onScan={handleQrScan} />}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
