"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { colorChoices, colorSequence, scoreSequence, type ColorKey } from "./cognitive-sequence";

type Screen =
  | "login"
  | "event"
  | "search"
  | "brief"
  | "sequence"
  | "race"
  | "recall"
  | "finish";

type Participant = {
  bib: string;
  name: string;
  category: string;
  wave: string;
  avatar: string;
  status: "Ready" | "On course";
};

const stations = [
  "Dumbbell Step-Ups",
  "Farmer’s Carry",
  "Bear Crawl",
  "Burpees to Plate",
  "Front Carry + Air Squats",
  "Tyre Flips",
];

const participants: Participant[] = [
  { bib: "A-1842", name: "Riya Sharma", category: "Female Open", wave: "Wave 12 · 09:40", avatar: "RS", status: "Ready" },
  { bib: "A-1847", name: "Rishabh Shah", category: "Male Open", wave: "Wave 12 · 09:40", avatar: "RS", status: "Ready" },
  { bib: "B-2419", name: "Arjun Menon", category: "Male Pro", wave: "Wave 14 · 10:20", avatar: "AM", status: "Ready" },
  { bib: "D-0916", name: "Meera & Tara", category: "Female Doubles", wave: "Wave 08 · 08:20", avatar: "MT", status: "On course" },
  { bib: "N-0341", name: "Aarav Rao", category: "NextGen Boys", wave: "Wave 03 · 16:30", avatar: "AR", status: "Ready" },
];

const sequenceLength = colorSequence.length;

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
  const [query, setQuery] = useState("");
  const [athlete, setAthlete] = useState<Participant>(participants[0]);
  const [station, setStation] = useState(0);
  const [penalties, setPenalties] = useState<number[]>(Array(6).fill(0));
  const [notes, setNotes] = useState<string[]>(Array(6).fill(""));
  const [recall, setRecall] = useState<ColorKey[]>([]);
  const [recallPenalty, setRecallPenalty] = useState(0);
  const [seconds, setSeconds] = useState(10);
  const [online, setOnline] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState("");

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
    if (screen !== "sequence" || seconds <= 0) return;
    const t = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [screen, seconds]);

  useEffect(() => {
    if (!["race", "recall", "finish"].includes(screen)) return;
    localStorage.setItem(
      "hyfit-games-active-race",
      JSON.stringify({ athlete, station, penalties, notes, recall, recallPenalty, updatedAt: Date.now() }),
    );
  }, [athlete, station, penalties, notes, recall, recallPenalty, screen]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return q ? participants.filter((p) => `${p.name} ${p.bib}`.toLowerCase().includes(q)) : participants.slice(0, 3);
  }, [query]);

  const { correctCount, percentage: score } = useMemo(() => scoreSequence(recall), [recall]);
  const recallComplete = recall.length === sequenceLength;
  const stationTotal = penalties.reduce((a, b) => a + b, 0);
  const total = stationTotal + recallPenalty;

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function login() {
    if (!judgeId.trim()) return flash("Enter your Judge, Volunteer or Mobile ID");
    setScreen("event");
  }

  function chooseAthlete(p: Participant) {
    if (p.status === "On course") return flash("Already assigned. Ask the Control Desk to reassign.");
    setAthlete(p);
    setScreen("brief");
  }

  function setPenalty(value: number) {
    setPenalties((current) => current.map((p, i) => (i === station ? value : p)));
  }

  function nextStation() {
    if (station < 5) setStation((s) => s + 1);
    else setScreen("recall");
  }

  function resetDemo() {
    localStorage.removeItem("hyfit-games-active-race");
    setScreen("login");
    setJudgeId("");
    setQuery("");
    setStation(0);
    setPenalties(Array(6).fill(0));
    setNotes(Array(6).fill(""));
    setRecall([]);
    setRecallPenalty(0);
    setSeconds(10);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => screen === "login" || flash("Race is locked while judging")}>
          <Image className="brand-logo" src="/branding/hyfit-games-logo.png" alt="HYFIT Games — Run. Lift. Live." width={68} height={68} priority />
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
              <input value={judgeId} onChange={(e) => setJudgeId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="e.g. J-1042 or mobile number" autoFocus />
            </div>
            <button className="primary" onClick={login}>Continue <span>→</span></button>
            <div className="demo-note">Demo access: enter any ID</div>
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
              <button className={["search","brief","sequence","race","recall","finish"].includes(screen) ? "active" : ""}>◎ <span>Active race</span></button>
              <button onClick={() => flash("No pending drafts on this device")}>↻ <span>Saved drafts</span><i>0</i></button>
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
                    <Image className="event-logo" src="/branding/hyfit-games-logo.png" alt="HYFIT Games — Run. Lift. Live." width={112} height={112} />
                    <h3>HYFIT Games Bengaluru</h3>
                    <p>Hall A · Manpho Convention Centre</p>
                    <div className="event-stats"><span><b>4,982</b> Athletes</span><span><b>24</b> Active waves</span></div>
                    <div className="event-cta">Enter event <span>→</span></div>
                  </button>
                  <div className="event-card muted">
                    <div className="event-top"><span className="later">UP NEXT</span><i>Tomorrow</i></div>
                    <Image className="event-logo ghost" src="/branding/hyfit-games-logo.png" alt="HYFIT Games — Run. Lift. Live." width={112} height={112} /><h3>HYFIT Games Bengaluru</h3><p>Day 2 · Starts 07:00</p>
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
                <div className="search-box"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search BIB or participant name…" autoFocus/><kbd>⌘ K</kbd></div>
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
                  <button className="primary" onClick={() => setScreen("sequence")}>Pair & begin cognitive sequence <span>→</span></button>
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
                <div className="progress">{stepLabels.map((s, i) => <div key={s} className={i === station + 1 ? "current" : i <= station ? "done" : ""}><i>{i <= station ? "✓" : i}</i><span>{s}</span></div>)}</div>
                <div className="station-layout">
                  <div className="station-card">
                    <div className="station-number">STATION {station + 1} OF 6</div>
                    <h3>{stations[station]}</h3>
                    <p>200 m run completed · Observe the full movement standard.</p>
                    <div className="quick-label"><b>Penalty</b><span>Add seconds only for an observed violation</span></div>
                    <div className="penalty-pills">{[0,5,10,15,20,30].map((v) => <button key={v} className={penalties[station] === v ? "active" : ""} onClick={() => setPenalty(v)}>{v === 0 ? "No penalty" : `+${v}s`}</button>)}</div>
                    <div className="custom-penalty"><label>Custom seconds</label><input type="number" min="0" max="300" value={penalties[station]} onChange={(e) => setPenalty(Math.max(0, Number(e.target.value)))} /></div>
                    <label className="notes-label">Judge note <small>Optional · useful for reviews</small></label>
                    <textarea value={notes[station]} onChange={(e) => setNotes((n) => n.map((x,i) => i === station ? e.target.value : x))} placeholder="e.g. 2 incomplete reps after warning…" />
                    <button className="primary" onClick={nextStation}>Save & {station === 5 ? "begin recall" : "continue to 200 m run"} <span>→</span></button>
                  </div>
                  <aside className="standard-card"><div className="standard-icon">◎</div><h4>Movement standard</h4><p>Watch for complete range of motion, correct load and station boundary.</p><ul><li>Give one clear verbal warning</li><li>Apply only published penalties</li><li>Use a note for disputed calls</li></ul><button onClick={() => setShowHelp(true)}>View station rules</button></aside>
                </div>
              </>
            )}

            {screen === "recall" && (
              <div className="recall-wrap">
                <div className="race-meta"><span>{athlete.bib} · {athlete.name}</span><b>COGNITIVE RECALL</b></div>
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
                <button className="primary wide" disabled={!recallComplete || (score < 60 && recallPenalty === 0)} onClick={() => setScreen("finish")}>Confirm recall & finish <span>→</span></button>
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
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
