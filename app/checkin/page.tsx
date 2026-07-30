"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import QrScanner from "../qr-scanner";
import SignaturePad from "../signature-pad";
import { isDoublesContestId } from "../doubles";

type StageType = "STAGE_1_WRISTBAND" | "STAGE_2_TRANSPONDER";
type StageReceipt = { state: string; completedAt: string; stationCode: string; stationName: string; volunteerName: string; assetCode: string };
type Person = { id: string; bib: string; name: string; gender: string; dateOfBirth: string; category: string; contestId: string; wave: string; club: string; wristbandCode?: string; transponderCode?: string };
type ParticipantResult = { participant: Person; teammates: Array<Person & { stages: Record<string,string> }>; teamWarning: string | null; stages: Partial<Record<StageType,StageReceipt>> };
type CheckinContext = {
  volunteer: { id: string; staffId: string; name: string };
  station: { id: string; code: string; name: string; stageType: StageType } | null;
  policy: { requireParticipantPhoto: boolean; requireDeclaratorySignature: boolean; declarationText: string; declarationVersion: number };
};
type CompletionReceipt = { bib: string; state: string; completedAt: string; assetCode: string; transactionId: string };

async function jsonApi(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function displayDate(value: string) {
  if (!value) return "Not provided";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CheckinPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [credentials, setCredentials] = useState({ staffId: "", pin: "" });
  const [context, setContext] = useState<CheckinContext | null>(null);
  const [result, setResult] = useState<ParticipantResult | null>(null);
  const [bib, setBib] = useState("");
  const [assetCode, setAssetCode] = useState("");
  const [idVerified, setIdVerified] = useState(false);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [scanTarget, setScanTarget] = useState<"bib"|"asset"|null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<CompletionReceipt | null>(null);
  const [transactionKey, setTransactionKey] = useState(() => crypto.randomUUID());

  const stageType = context?.station?.stageType;
  const stageOne = stageType === "STAGE_1_WRISTBAND";
  const existing = stageType ? result?.stages[stageType] : null;
  const canComplete = useMemo(() => {
    if (!result || !context?.station || !assetCode || existing) return false;
    if (!stageOne) return Boolean(result.stages.STAGE_1_WRISTBAND);
    return idVerified && declarationAccepted &&
      (!context.policy.requireParticipantPhoto || Boolean(photo)) &&
      (!context.policy.requireDeclaratorySignature || Boolean(signature));
  }, [result, context, assetCode, existing, stageOne, idVerified, declarationAccepted, photo, signature]);

  async function signIn() {
    try {
      await jsonApi("/api/auth/login", { method: "POST", body: JSON.stringify({ ...credentials, deviceLabel: navigator.userAgent }) });
      const assigned = await jsonApi("/api/checkin/context");
      setContext(assigned); setLoggedIn(true);
      if (!assigned.station) setMessage("Admin must assign this volunteer to an enabled Stage 1 or Stage 2 counter.");
    } catch (error) { setMessage((error as Error).message); }
  }
  async function findBib(value = bib) {
    try {
      const data = await jsonApi(`/api/checkin/participant?bib=${encodeURIComponent(value)}`);
      setResult(data); setBib(value); setMessage(""); setReceipt(null);
    } catch (error) { setMessage((error as Error).message); }
  }
  function scanned(value: string) {
    const clean = value.trim();
    if (!clean) return "QR code is empty";
    const target = scanTarget;
    if (target === "bib" && !/^\d+$/.test(clean)) return "Participant QR must contain a numeric BIB";
    setScanTarget(null);
    if (target === "bib") { setBib(clean); void findBib(clean); } else setAssetCode(clean);
    return null;
  }
  async function uploadMedia(file: File, mediaType: "participant_photo"|"signature") {
    const form = new FormData();
    form.set("file", file); form.set("mediaType", mediaType);
    form.set("participantId", result!.participant.id); form.set("transactionKey", transactionKey);
    const response = await fetch("/api/checkin/media", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Media upload failed");
    return data.mediaId as string;
  }
  async function complete() {
    if (!canComplete || !result || !stageType) return;
    setBusy(true); setMessage("");
    try {
      const [photoMediaId, signatureMediaId] = await Promise.all([
        photo ? uploadMedia(photo, "participant_photo") : null,
        signature ? uploadMedia(signature, "signature") : null,
      ]);
      const completed = await jsonApi("/api/checkin/stage", {
        method: "POST",
        body: JSON.stringify({
          participantId: result.participant.id, stageType, assetCode,
          governmentIdVerified: idVerified, verbalDeclarationAccepted: declarationAccepted,
          photoMediaId, signatureMediaId, idempotencyKey: transactionKey,
          clientObservedAt: new Date().toISOString(),
        }),
      });
      setReceipt(completed);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function sendToHelpDesk() {
    if (!result || !stageOne) {
      setMessage("Ask the Help Desk or Event Admin to resolve this athlete before continuing.");
      return;
    }
    const note = window.prompt("Briefly describe what did not match (do not enter any Government ID number):", "");
    if (note == null) return;
    try {
      await jsonApi("/api/checkin/exception", { method: "POST", body: JSON.stringify({ participantId: result.participant.id, reason: "IDENTITY_MISMATCH", note }) });
      setMessage(`BIB ${result.participant.bib} sent to Help Desk. Do not issue a wristband.`);
    } catch (error) { setMessage((error as Error).message); }
  }
  function reset() {
    setResult(null); setBib(""); setAssetCode(""); setIdVerified(false);
    setDeclarationAccepted(false); setPhoto(null); setSignature(null);
    setReceipt(null); setMessage(""); setTransactionKey(crypto.randomUUID());
  }

  if (!loggedIn) return <main className="ops-login checkin-login"><div className="ops-login-card"><Image src="/branding/hyfit-games-2026-white.svg" width={90} height={90} unoptimized alt="HYFIT"/><div className="ops-kicker">VOLUNTEER OPERATIONS</div><h1>Check-in sign in</h1><input placeholder="Staff ID" value={credentials.staffId} onChange={(event)=>setCredentials({...credentials,staffId:event.target.value})}/><input type="password" inputMode="numeric" placeholder="PIN" value={credentials.pin} onChange={(event)=>setCredentials({...credentials,pin:event.target.value})}/><button onClick={signIn}>Open my counter</button>{message&&<p className="ops-error">{message}</p>}</div></main>;

  const stageLabel = stageOne ? "STAGE 1 · WRISTBAND" : "STAGE 2 · TRANSPONDER";
  const participant = result?.participant;
  if (receipt) return <main className={`checkin-shell stage-shell ${stageOne ? "stage-one" : "stage-two"}`}>
    <header><Image src="/branding/hyfit-games-2026-white.svg" width={55} height={55} unoptimized alt="HYFIT"/><div><small>{stageLabel}</small><b>{context?.station?.code} · {context?.station?.name}</b></div><span className="ops-live">● Saved locally</span></header>
    <section className="stage-receipt"><div className="receipt-check">✓</div><small>{stageOne ? "WRISTBAND HANDED OVER" : "TRANSPONDER HANDED OVER"}</small><h1>BIB {receipt.bib}</h1><div className="receipt-asset"><span>{stageOne ? "WRISTBAND" : "TRANSPONDER1"}</span><b>{receipt.assetCode}</b></div><p>{new Date(receipt.completedAt).toLocaleString()} · {receipt.state === "completed" ? "RaceResult confirmed" : receipt.state === "attention" ? "RaceResult needs Admin attention" : "RaceResult sync pending"}</p><button className="stage-primary" onClick={reset}>Next athlete</button></section>
  </main>;

  return <main className={`checkin-shell stage-shell ${stageOne ? "stage-one" : "stage-two"}`}>
    <header><Image src="/branding/hyfit-games-2026-white.svg" width={55} height={55} unoptimized alt="HYFIT"/><div><small>{stageLabel}</small><b>{context?.station ? `${context.station.code} · ${context.station.name}` : "Counter not assigned"}</b></div><span className="ops-live">● Local server</span></header>
    <div className="stage-rail"><b>{stageOne ? "01" : "02"}</b><span>{stageOne ? "VERIFY → DECLARE → WRISTBAND" : "CHECK STAGE 1 → TRANSPONDER"}</span><small>{context?.volunteer.staffId} · {context?.volunteer.name}</small></div>
    <section className="checkin-content stage-content">
      {message&&<div className="ops-message">{message}<button onClick={()=>setMessage("")}>×</button></div>}
      {!participant ? <article className="scan-card stage-scan"><div className="scan-symbol">▦</div><small>{stageLabel}</small><h1>Scan athlete QR</h1><p>The QR should contain the athlete’s numeric BIB.</p><button className="stage-primary" disabled={!context?.station} onClick={()=>setScanTarget("bib")}>Open camera scanner</button><div className="manual-line"><input inputMode="numeric" placeholder="Enter BIB manually" value={bib} onChange={(event)=>setBib(event.target.value)}/><button onClick={()=>void findBib()}>Find athlete</button></div></article>
      : <div className="stage-workspace">
        <section className="identity-column">
          <article className="identity-card">
            <div className="identity-top"><div><small>VERIFY ATHLETE</small><h1>{participant.name}</h1></div><strong><small>BIB</small>{participant.bib}</strong></div>
            <div className="identity-grid"><div><small>GENDER</small><b>{participant.gender || "Not provided"}</b></div><div><small>DATE OF BIRTH</small><b>{displayDate(participant.dateOfBirth)}</b></div><div><small>CONTEST</small><b>{participant.category}</b></div><div><small>WAVE TIME</small><b>{participant.wave}</b></div></div>
          </article>
          {isDoublesContestId(participant.contestId) && <article className="team-card"><small>DOUBLES TEAM · {participant.club || "Team data needs attention"}</small>{result!.teammates.map((mate)=><div key={mate.id}><span><b>{mate.name}</b><small>BIB {mate.bib} · {mate.gender} · {displayDate(mate.dateOfBirth)}</small></span><em>{mate.stages?.STAGE_2_TRANSPONDER ? "Stage 2 ✓" : mate.stages?.STAGE_1_WRISTBAND ? "Stage 1 ✓" : "Waiting"}</em></div>)}{result!.teamWarning&&<p>⚠ {result!.teamWarning}</p>}</article>}
          {!stageOne && result!.stages.STAGE_1_WRISTBAND && <article className="prior-stage-card"><small>STAGE 1 RECEIPT</small><b>Wristband {result!.stages.STAGE_1_WRISTBAND.assetCode}</b><span>{new Date(result!.stages.STAGE_1_WRISTBAND.completedAt).toLocaleString()} · {result!.stages.STAGE_1_WRISTBAND.stationCode} · {result!.stages.STAGE_1_WRISTBAND.volunteerName}</span></article>}
        </section>
        <section className="action-column">
          {existing ? <article className="already-done"><b>✓ {stageOne ? "Stage 1" : "Stage 2"} already complete</b><p>{existing.assetCode} · {new Date(existing.completedAt).toLocaleString()}</p><button className="stage-primary" onClick={reset}>Scan next athlete</button></article>
          : stageOne ? <>
            <button className={`verify-button ${idVerified ? "confirmed" : ""}`} onClick={()=>setIdVerified(!idVerified)}><b>{idVerified ? "✓ ID verified" : "Government ID verified"}</b><span>Compare name, gender and date of birth</span></button>
            <article className="declaration-card"><small>PARTICIPANT DECLARATION</small><p>{context?.policy.declarationText}</p><label><input type="checkbox" checked={declarationAccepted} onChange={(event)=>setDeclarationAccepted(event.target.checked)}/><span>I confirm the athlete accepts this declaration</span></label></article>
            {context?.policy.requireParticipantPhoto&&<article className="evidence-card"><small>REQUIRED PHOTO</small><label className={photo?"captured":""}><input type="file" accept="image/*" capture="user" onChange={(event)=>setPhoto(event.target.files?.[0]??null)}/><b>{photo?"✓ Photo ready":"Take participant photo"}</b></label></article>}
            {context?.policy.requireDeclaratorySignature&&<article className="evidence-card"><small>REQUIRED SIGNATURE</small><SignaturePad onChange={setSignature}/></article>}
            <button className="asset-scan-button" onClick={()=>setScanTarget("asset")}><small>WRISTBAND</small><b>{assetCode||"Scan wristband"}</b><span>{assetCode?"Tap to rescan":"Camera or manual entry"}</span></button>
          </> : !result!.stages.STAGE_1_WRISTBAND ? <article className="stage-blocked"><b>Stage 1 is not complete</b><p>Send the athlete to the Check-In and Wristband counter before assigning a transponder.</p><button onClick={reset}>Scan another athlete</button></article>
          : <button className="asset-scan-button transponder" onClick={()=>setScanTarget("asset")}><small>TRANSPONDER1</small><b>{assetCode||"Scan transponder"}</b><span>{assetCode?"Tap to rescan":"Camera or manual entry"}</span></button>}
          {!existing && ((stageOne) || result!.stages.STAGE_1_WRISTBAND) && <><div className="manual-asset"><input placeholder={`Enter ${stageOne?"wristband":"transponder"} code`} value={assetCode} onChange={(event)=>setAssetCode(event.target.value)}/></div><button className="stage-primary complete-stage" disabled={!canComplete||busy} onClick={()=>void complete()}>{busy?"Saving…":`Complete ${stageOne?"Stage 1":"Stage 2"}`}</button></>}
          <button className="help-desk-action" onClick={()=>void sendToHelpDesk()}>Identity problem? Send to Help Desk</button>
          <button className="checkin-reset" onClick={reset}>Cancel / change athlete</button>
        </section>
      </div>}
    </section>
    {scanTarget&&<QrScanner onClose={()=>setScanTarget(null)} onScan={scanned}/>}
  </main>;
}
