"use client";

import Image from "next/image";
import { useState } from "react";
import QrScanner from "../qr-scanner";
import "../operations.css";

type Participant = { id: string; bib: string; name: string; category: string; wave: string; checkinState: string; wristbandCode?: string; transponderCode?: string };

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function CheckinPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [credentials, setCredentials] = useState({ staffId: "", pin: "" });
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [bib, setBib] = useState("");
  const [wristband, setWristband] = useState("");
  const [transponder, setTransponder] = useState("");
  const [scanTarget, setScanTarget] = useState<"bib"|"wristband"|"transponder"|null>(null);
  const [message, setMessage] = useState("");

  async function signIn() { try { await api("/api/auth/login",{method:"POST",body:JSON.stringify({...credentials,deviceLabel:navigator.userAgent})}); setLoggedIn(true); } catch(error){setMessage((error as Error).message);} }
  async function findBib(value = bib) { try { const data=await api(`/api/checkin/participant?bib=${encodeURIComponent(value)}`); setParticipant(data.participant); setBib(value); setMessage(""); } catch(error){setMessage((error as Error).message);} }
  function scanned(value:string) {
    const clean=value.trim(); if(!clean) return "QR code is empty";
    if(scanTarget==="bib"&&!/^\d+$/.test(clean)) return "Participant QR must contain a numeric BIB";
    setScanTarget(null);
    if(scanTarget==="bib"){setBib(clean);void findBib(clean);} else if(scanTarget==="wristband") setWristband(clean); else setTransponder(clean);
    return null;
  }
  async function complete() { if(!participant||!wristband||!transponder)return setMessage("Scan both wristband and Transponder1"); try { const result=await api("/api/checkin/assign",{method:"POST",body:JSON.stringify({participantId:participant.id,wristbandCode:wristband,transponderCode:transponder,desk:"Main Gate"})}); setMessage(`BIB ${result.bib} checked in · RaceResult sync pending`);setParticipant(null);setBib("");setWristband("");setTransponder(""); } catch(error){setMessage((error as Error).message);} }

  if(!loggedIn)return <main className="ops-login"><div className="ops-login-card"><Image src="/branding/hyfit-games-logo.png" width={90} height={90} unoptimized alt="HYFIT"/><div className="ops-kicker">VOLUNTEER OPERATIONS</div><h1>Check-in sign in</h1><input placeholder="Staff ID" value={credentials.staffId} onChange={(e)=>setCredentials({...credentials,staffId:e.target.value})}/><input type="password" inputMode="numeric" placeholder="PIN" value={credentials.pin} onChange={(e)=>setCredentials({...credentials,pin:e.target.value})}/><button onClick={signIn}>Open Check-in</button>{message&&<p className="ops-error">{message}</p>}</div></main>;
  return <main className="checkin-shell"><header><Image src="/branding/hyfit-games-logo.png" width={55} height={55} unoptimized alt="HYFIT"/><div><small>HYFIT GAMES</small><b>ATHLETE CHECK-IN</b></div><span className="ops-live">● Local server</span></header><section className="checkin-content"><div className="checkin-progress"><span className={participant?"done":"active"}>1 · Participant</span><span className={wristband?"done":participant?"active":""}>2 · Wristband</span><span className={transponder?"done":wristband?"active":""}>3 · Transponder1</span><span className={transponder?"active":""}>4 · Confirm</span></div>{message&&<div className="ops-message">{message}<button onClick={()=>setMessage("")}>×</button></div>}
    {!participant?<article className="scan-card"><div className="scan-symbol">▦</div><h1>Scan participant QR</h1><p>The participant QR contains their numeric RaceResult BIB.</p><button className="ops-primary" onClick={()=>setScanTarget("bib")}>Open camera scanner</button><div className="manual-line"><input inputMode="numeric" placeholder="Or enter BIB" value={bib} onChange={(e)=>setBib(e.target.value)}/><button onClick={()=>void findBib()}>Find</button></div></article>
    :<><article className="participant-verify"><div className="avatar large">{participant.name.split(/\s+/).slice(0,2).map(x=>x[0]).join("")}</div><div><small>VERIFY PARTICIPANT</small><h1>{participant.name}</h1><p>{participant.category} · {participant.wave}</p></div><strong><small>BIB</small>{participant.bib}</strong></article><div className="assignment-grid"><article className={wristband?"assigned":""}><small>STEP 2</small><h2>Wristband QR</h2><b>{wristband||"Not assigned"}</b><button onClick={()=>setScanTarget("wristband")}>{wristband?"Rescan":"Scan wristband"}</button></article><article className={transponder?"assigned":""}><small>STEP 3</small><h2>Transponder1 QR</h2><b>{transponder||"Not assigned"}</b><button onClick={()=>setScanTarget("transponder")}>{transponder?"Rescan":"Scan Transponder1"}</button></article></div><button className="ops-primary complete-checkin" disabled={!wristband||!transponder} onClick={complete}>Confirm & complete check-in</button><button className="checkin-reset" onClick={()=>{setParticipant(null);setWristband("");setTransponder("");}}>Cancel / change participant</button></>}
  </section>{scanTarget&&<QrScanner onClose={()=>setScanTarget(null)} onScan={scanned}/>}</main>;
}
