"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { colorChoices, colorSequence, type ColorKey } from "./cognitive-sequence";
import {
  formatRaceTime,
  raceStage,
  raceStages,
  type StationOutcome,
} from "./race-format";
import type { Participant } from "./participants";

type Split = {
  id: string;
  stageId: string;
  stageName: string;
  boundaryAt: string;
  cumulativeMs: string | number;
  segmentMs: string | number;
};

type TimingSnapshot = {
  session: {
    id: string;
    bib: string;
    participantName: string;
    currentStage: string;
    manualStartedAt: string | null;
    cognitiveRecallStartedAt: string | null;
    isOoc: boolean;
    state: string;
  };
  splits: Split[];
  outcomes: Array<{
    stationNumber: number;
    outcome: StationOutcome;
    penaltySeconds: number;
    note: string;
  }>;
  cognitive: null | {
    response: ColorKey[];
    correctCount: number;
    percentage: number;
    penaltySeconds: number;
    bonusSeconds: number;
    recallDurationMs: string | number;
  };
};

type TimingAction = Record<string, unknown> & {
  action: string;
  operationId: string;
  bib: string;
  clientObservedAt: string;
};

function newOperationId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function numeric(value: string | number | undefined) {
  return Number(value ?? 0);
}

export default function TimingConsole({
  athlete,
  onJudgeNextAthlete,
}: {
  athlete: Participant;
  onJudgeNextAthlete: () => void;
}) {
  const [snapshot, setSnapshot] = useState<TimingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [outcome, setOutcome] = useState<StationOutcome>("none");
  const [note, setNote] = useState("");
  const [recall, setRecall] = useState<ColorKey[]>([]);
  const [recallSubmitting, setRecallSubmitting] = useState(false);
  const recallLocked = useRef(false);
  const recallRef = useRef<ColorKey[]>([]);
  const tapTimesRef = useRef<string[]>([]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/judge/timing?bib=${encodeURIComponent(athlete.bib)}`, { cache: "no-store" });
    const data = await response.json() as TimingSnapshot & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Race timing could not be loaded");
    setSnapshot(data);
  }, [athlete.bib]);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      setLoading(true);
      void load().catch((loadError) => setError((loadError as Error).message)).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(restore);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  const stage = raceStage(snapshot?.session.currentStage ?? "ready");
  const lastSplit = snapshot?.splits.at(-1);
  const startMs = snapshot?.session.manualStartedAt
    ? new Date(snapshot.session.manualStartedAt).getTime()
    : null;
  const lastBoundaryMs = lastSplit
    ? new Date(lastSplit.boundaryAt).getTime()
    : startMs;
  const totalMs = startMs
    ? (snapshot?.session.state === "finished" && lastSplit
        ? numeric(lastSplit.cumulativeMs)
        : now - startMs)
    : 0;
  const stageMs = lastBoundaryMs && startMs ? now - lastBoundaryMs : 0;

  async function act(extra: Record<string, unknown>) {
    if (busy) return null;
    setBusy(true);
    setError("");
    const body: TimingAction = {
      action: String(extra.action),
      operationId: newOperationId(),
      bib: athlete.bib,
      clientObservedAt: new Date().toISOString(),
      ...extra,
    };
    try {
      const response = await fetch("/api/judge/timing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as TimingSnapshot & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "That timing action was not accepted");
      setSnapshot(data);
      return data;
    } catch (actionError) {
      setError((actionError as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function completeCurrentStage() {
    if (!stage || !["run", "station"].includes(stage.kind)) return;
    if (stage.kind === "station" && outcome === "ics" && !note.trim()) {
      setError("Add a short note explaining why this station is incomplete.");
      return;
    }
    const result = await act({
      action: "complete_stage",
      stageId: stage.id,
      outcome: stage.kind === "station" ? outcome : "none",
      penaltySeconds: stage.stationNumber === 3 && outcome === "penalty" ? 10 : 0,
      note: stage.kind === "station" ? note.trim() : "",
    });
    if (result) {
      setOutcome("none");
      setNote("");
    }
  }

  async function tapColour(color: ColorKey) {
    if (busy || recallLocked.current || recallRef.current.length >= colorSequence.length) return;
    const tappedAt = new Date().toISOString();
    const nextRecall = [...recallRef.current, color];
    const nextTimes = [...tapTimesRef.current, tappedAt];
    recallRef.current = nextRecall;
    tapTimesRef.current = nextTimes;
    setRecall(nextRecall);
    if (nextRecall.length !== colorSequence.length) return;
    recallLocked.current = true;
    setRecallSubmitting(true);
    const result = await act({
      action: "complete_recall",
      response: nextRecall,
      tapObservedAt: nextTimes,
      clientObservedAt: tappedAt,
    });
    if (!result) recallLocked.current = false;
    setRecallSubmitting(false);
  }

  const courseIndex = useMemo(
    () => raceStages.findIndex((item) => item.id === stage?.id),
    [stage?.id],
  );

  if (loading) {
    return <section className="timing-console timing-loading"><b>Loading race timing…</b><span>Keep this screen open.</span></section>;
  }
  if (!snapshot || !stage) {
    return <section className="timing-console timing-error"><b>Race timing is unavailable</b><span>{error}</span><button className="timing-primary" onClick={() => void load()}>Try again</button></section>;
  }

  const isComplete = stage.kind === "complete";
  return (
    <section className={`timing-console${snapshot.session.isOoc ? " is-ooc" : ""}`}>
      <header className="timing-athlete-rail">
        <div>
          <small>ACTIVE ATHLETE</small>
          <strong>{athlete.name}</strong>
          <span>{athlete.category || "HYFIT athlete"}</span>
        </div>
        <div className="timing-bib"><small>BIB</small><b>{athlete.bib}</b></div>
        <div className="timing-clock"><small>TOTAL TIME</small><b>{formatRaceTime(totalMs)}</b><span>{startMs ? "Running from Show Colours" : "Starts with Show Colours"}</span></div>
      </header>

      {snapshot.session.isOoc && (
        <div className="timing-ooc" role="status">
          <b>OOC · Incomplete station</b>
          <span>Keep timing every remaining stage through the Finish Line.</span>
        </div>
      )}

      <div className="timing-course-strip" aria-label="Race progress">
        {raceStages.filter((item) => !["ready", "complete"].includes(item.id)).map((item) => {
          const index = raceStages.findIndex((candidate) => candidate.id === item.id);
          return <span key={item.id} className={index < courseIndex ? "done" : index === courseIndex ? "active" : ""} title={item.name} />;
        })}
      </div>

      <div className="timing-layout">
        <article className="timing-stage-card">
          <div className="timing-stage-kicker">
            <span>NOW TIMING</span>
            {startMs && !isComplete && <b>{formatRaceTime(stageMs)}</b>}
          </div>
          <h1>{stage.name}</h1>
          <p>{stage.instruction}</p>

          {error && <div className="timing-action-error" role="alert">{error}</div>}

          {stage.kind === "ready" && (
            <button className="timing-primary timing-show-colours" disabled={busy} onClick={() => void act({ action: "start" })}>
              <span>Show Colours</span>
              <small>Starts the race and memorisation time</small>
            </button>
          )}

          {stage.kind === "memorise" && (
            <>
              <div className="timing-sequence" aria-label="Colour sequence to memorise">
                {colorSequence.map((color, index) => (
                  <div key={index} style={{ "--memory-color": colorChoices[color].color, "--memory-text": colorChoices[color].textColor } as React.CSSProperties}>
                    <small>{index + 1}</small><b>{color}</b>
                  </div>
                ))}
              </div>
              <div className="timing-callout">Keep these colours visible. Tap only when the athlete says they are ready.</div>
              <button className="timing-primary" disabled={busy} onClick={() => void act({ action: "memorise_complete" })}>
                <span>Cognitive Memorise Complete</span>
                <small>Hide colours and start 200 m Run 1</small>
              </button>
            </>
          )}

          {stage.kind === "station" && (
            <div className="timing-outcomes">
              <label className={outcome === "none" ? "selected" : ""}>
                <input type="radio" name="outcome" checked={outcome === "none"} onChange={() => setOutcome("none")} />
                <b>No penalty</b><span>Station completed correctly</span>
              </label>
              {stage.stationNumber === 3 && (
                <label className={outcome === "penalty" ? "selected penalty" : ""}>
                  <input type="radio" name="outcome" checked={outcome === "penalty"} onChange={() => setOutcome("penalty")} />
                  <b>+10 seconds</b><span>Knee touched during Bear Crawl</span>
                </label>
              )}
              <label className={outcome === "ics" ? "selected ics" : ""}>
                <input type="radio" name="outcome" checked={outcome === "ics"} onChange={() => setOutcome("ics")} />
                <b>ICS</b><span>Incomplete station · marks athlete OOC</span>
              </label>
              {outcome === "ics" && (
                <label className="timing-note">
                  <span>Why was the station incomplete?</span>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Short judge note required…" />
                </label>
              )}
            </div>
          )}

          {["run", "station"].includes(stage.kind) && (
            <button className={`timing-primary${outcome === "ics" ? " danger" : ""}`} disabled={busy || (stage.kind === "station" && outcome === "ics" && !note.trim())} onClick={() => void completeCurrentStage()}>
              <span>{stage.kind === "run" ? `Complete ${stage.name}` : `Complete ${stage.name}`}</span>
              <small>{stage.id === "station_6" ? "Close Tyre Flips and start Cognitive Recall" : `Next: ${raceStage(stage.nextId ?? "")?.name ?? "Finish"}`}</small>
            </button>
          )}

          {stage.kind === "recall" && (
            <>
              <div className="timing-recall-progress">
                {colorSequence.map((_, index) => <span key={index} className={recall[index] ? "filled" : ""}>{recall[index] ?? index + 1}</span>)}
              </div>
              <div className="timing-colour-buttons">
                {(Object.keys(colorChoices) as ColorKey[]).map((color) => (
                  <button key={color} disabled={busy || recallSubmitting} onClick={() => void tapColour(color)} style={{ "--tap-color": colorChoices[color].color, "--tap-text": colorChoices[color].textColor } as React.CSSProperties}>
                    <b>{colorChoices[color].label}</b><span>Tap {color}</span>
                  </button>
                ))}
              </div>
              {recall.length > 0 && recall.length < colorSequence.length && (
                <button className="timing-reset" onClick={() => { recallRef.current = []; tapTimesRef.current = []; setRecall([]); }}>Reset recall</button>
              )}
              <div className="timing-callout">{recall.length} of {colorSequence.length} colours · The last tap calculates the score automatically.</div>
            </>
          )}

          {stage.kind === "finish" && (
            <>
              {snapshot.cognitive && (
                <div className="timing-cognitive-result">
                  <div><small>CORRECT</small><b>{snapshot.cognitive.correctCount}/10</b></div>
                  <div><small>SCORE</small><b>{snapshot.cognitive.percentage}%</b></div>
                  <div><small>ADJUSTMENT</small><b>{snapshot.cognitive.bonusSeconds ? `30 s bonus` : snapshot.cognitive.penaltySeconds ? `+30 s` : "No change"}</b></div>
                </div>
              )}
              <button className="timing-primary timing-finish" disabled={busy} onClick={() => void act({ action: "finish" })}>
                <span>Finish Race</span><small>Tap when the athlete crosses the Finish Line</small>
              </button>
            </>
          )}

          {isComplete && (
            <div className="timing-complete">
              <div className="timing-complete-mark">✓</div>
              <h2>Race timing complete</h2>
              <p>All manual splits are saved. RaceResult updates continue automatically if any are pending.</p>
              <div className="timing-final-time"><small>MANUAL TOTAL</small><b>{formatRaceTime(totalMs)}</b></div>
              <button className="timing-primary" onClick={onJudgeNextAthlete}>Time next athlete</button>
            </div>
          )}
        </article>

        <aside className="timing-splits-panel">
          <div className="timing-panel-heading"><div><small>BACKUP TIMING</small><b>Recorded splits</b></div><span>{snapshot.splits.length}</span></div>
          <div className="timing-split-list">
            {[...snapshot.splits].reverse().map((split) => (
              <div key={split.id}>
                <span><b>{split.stageName}</b><small>Segment {formatRaceTime(numeric(split.segmentMs))}</small></span>
                <strong>{formatRaceTime(numeric(split.cumulativeMs))}</strong>
              </div>
            ))}
            {!snapshot.splits.length && <p>Your first split appears after Show Colours.</p>}
          </div>
          <div className="timing-sync-note"><span>↻</span><div><b>RR14 sync is automatic</b><small>Manual timing stays in this backup app.</small></div></div>
        </aside>
      </div>
    </section>
  );
}
