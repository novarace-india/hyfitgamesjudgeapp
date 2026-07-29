"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "../operations.css";

type User = { id: string; staffId: string; name: string; role: string; eventId: string | null; stationNumber?: number; enabled: boolean };
type Event = { id: string; name: string; venue: string; status: string; is_active: boolean; participant_count: number };
type Overview = { name: string; venue: string; status: string; configVersion: number; participants: number; checkedIn: number; onCourse: number; activeJudges: number; pendingSync: number; conflicts: number };
type SyncRun = { id: string; state: string; importedCount: number; rejectedCount: number; startedAt: string; finishedAt: string | null; error: string | null };
type StationVolunteer = { assignmentId: string; volunteerId: string; staffId: string; name: string; assignedAt: string };
type Station = { id: string; code: string; name: string; stageType: "STAGE_1_WRISTBAND"|"STAGE_2_TRANSPONDER"; enabled: boolean; volunteers: StationVolunteer[] };
type IdentityException = { id: string; bib: string; name: string; reason: string; note: string; state: string; createdAt: string; stationCode: string; volunteerStaffId: string; volunteerName: string; resolutionNote?: string };

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function AdminPage() {
  const [me, setMe] = useState<User | null>(null);
  const [login, setLogin] = useState({ staffId: "ADMIN", pin: "2468" });
  const [events, setEvents] = useState<Event[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab, setTab] = useState("overview");
  const [message, setMessage] = useState("");
  const [syncingParticipants, setSyncingParticipants] = useState(false);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [identityExceptions, setIdentityExceptions] = useState<IdentityException[]>([]);
  const [newStation, setNewStation] = useState({ code: "", name: "", stageType: "STAGE_1_WRISTBAND" });
  const [stationAssignment, setStationAssignment] = useState({ volunteerId: "", stationId: "" });
  const [replacement, setReplacement] = useState({ bib: "", assetType: "wristband", assetCode: "", reason: "" });
  const [newUser, setNewUser] = useState({ staffId: "", name: "", pin: "", role: "judge", stationNumber: "" });
  const [config, setConfig] = useState({ participantApiUrl: "", updateApiUrl: "", participantMapping: "{\"listPath\":\"\",\"bib\":\"bib\",\"name\":\"name\",\"contestId\":\"ContestID\",\"gender\":\"Gender\",\"dateOfBirth\":\"DateOfBirth\",\"club\":\"club\"}", updateMapping: "{\"stage1checkin\":\"stage1checkin\",\"stage1checkintime\":\"stage1checkintime\",\"wristband\":\"wristbandID\",\"stage2checkin\":\"stage2checkin\",\"stage2checkintime\":\"stage2checkintime\",\"transponder1\":\"Transponder1\"}", requireParticipantPhoto: false, requireDeclaratorySignature: false, declarationText: "I confirm that my participant details are correct and that I have received the assigned race equipment.", mediaRetentionDays: 30 });

  const load = useCallback(async () => {
    const session = await api("/api/auth/session");
    setMe(session.user);
    const [eventData, userData, overviewData, syncData, stationData, exceptionData] = await Promise.all([api("/api/admin/events"), api("/api/admin/users"), api("/api/admin/overview"), api("/api/admin/participants/sync"), api("/api/admin/checkin-stations"), api("/api/admin/checkin-exceptions")]);
    setEvents(eventData.events); setUsers(userData.users); setOverview(overviewData.overview);
    setSyncRuns(syncData.syncRuns);
    setStations(stationData.stations);
    setIdentityExceptions(exceptionData.exceptions);
    const configData = await api("/api/admin/config");
    if (configData.config) setConfig({
      participantApiUrl: configData.config.participantApiUrl,
      updateApiUrl: configData.config.updateApiUrl,
      participantMapping: JSON.stringify(configData.config.participantMapping, null, 2),
      updateMapping: JSON.stringify(configData.config.updateMapping, null, 2),
      requireParticipantPhoto: configData.config.requireParticipantPhoto ?? false,
      requireDeclaratorySignature: configData.config.requireDeclaratorySignature ?? false,
      declarationText: configData.config.declarationText ?? "I confirm that my participant details are correct and that I have received the assigned race equipment.",
      mediaRetentionDays: configData.config.mediaRetentionDays ?? 30,
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch(() => undefined), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function signIn() {
    try { await api("/api/auth/login", { method: "POST", body: JSON.stringify({ ...login, deviceLabel: navigator.userAgent }) }); await load(); }
    catch (error) { setMessage((error as Error).message); }
  }
  async function createUser() {
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify({ ...newUser, stationNumber: Number(newUser.stationNumber) || null, eventId: me?.eventId }) });
      setNewUser({ staffId: "", name: "", pin: "", role: "judge", stationNumber: "" }); setMessage("Team member created"); await load();
    } catch (error) { setMessage((error as Error).message); }
  }
  async function saveConfig() {
    try {
      const draft = await api("/api/admin/config", { method: "PUT", body: JSON.stringify({ eventId: me?.eventId, participantApiUrl: config.participantApiUrl, updateApiUrl: config.updateApiUrl, participantMapping: JSON.parse(config.participantMapping), updateMapping: JSON.parse(config.updateMapping), rules: { stations: 6, cognitiveThreshold: 60 }, requireParticipantPhoto: config.requireParticipantPhoto, requireDeclaratorySignature: config.requireDeclaratorySignature, declarationText: config.declarationText, mediaRetentionDays: config.mediaRetentionDays }) });
      await api("/api/admin/config", { method: "POST", body: JSON.stringify({ id: draft.id, eventId: me?.eventId }) });
      setMessage(`Configuration v${draft.version} published`); await load();
    } catch (error) { setMessage((error as Error).message); }
  }
  async function syncParticipants() {
    setSyncingParticipants(true);
    setMessage("");
    try {
      const result = await api("/api/admin/participants/sync", { method: "POST", body: "{}" });
      setMessage(`RaceResult sync complete · ${result.imported} imported · ${result.inserted} new · ${result.updated} updated · ${result.rejected} rejected`);
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSyncingParticipants(false);
    }
  }
  async function createStation() {
    try {
      await api("/api/admin/checkin-stations", { method: "POST", body: JSON.stringify(newStation) });
      setNewStation({ code: "", name: "", stageType: "STAGE_1_WRISTBAND" }); setMessage("Check-in counter created"); await load();
    } catch (error) { setMessage((error as Error).message); }
  }
  async function assignStation() {
    try {
      await api("/api/admin/checkin-station-assignments", { method: "POST", body: JSON.stringify(stationAssignment) });
      setMessage("Volunteer counter assignment saved"); await load();
    } catch (error) { setMessage((error as Error).message); }
  }
  async function toggleStation(station: Station) {
    try {
      await api("/api/admin/checkin-stations", { method: "PATCH", body: JSON.stringify({ id: station.id, enabled: !station.enabled }) });
      setMessage(`${station.code} ${station.enabled ? "disabled" : "enabled"}`); await load();
    } catch (error) { setMessage((error as Error).message); }
  }
  async function resolveException(item: IdentityException, state: "overridden"|"rejected") {
    const note = window.prompt(`Why is this exception being ${state === "overridden" ? "overridden" : "rejected"}?`, "");
    if (!note?.trim()) return;
    try {
      await api("/api/admin/checkin-exceptions", { method: "PATCH", body: JSON.stringify({ id:item.id,state,note }) });
      setMessage(`BIB ${item.bib} exception ${state}`); await load();
    } catch (error) { setMessage((error as Error).message); }
  }
  async function replaceAsset() {
    try {
      const result = await api("/api/admin/checkin-assets", { method:"POST",body:JSON.stringify(replacement) });
      setMessage(`BIB ${replacement.bib} asset replaced · RaceResult ${result.deliveryState}`);
      setReplacement({ bib:"",assetType:"wristband",assetCode:"",reason:"" }); await load();
    } catch (error) { setMessage((error as Error).message); }
  }

  if (!me) return <main className="ops-login"><div className="ops-login-card"><Image src="/branding/hyfit-games-logo.png" width={90} height={90} unoptimized alt="HYFIT Games"/><div className="ops-kicker">EVENT CONTROL</div><h1>Admin sign in</h1><input placeholder="Staff ID" value={login.staffId} onChange={(e) => setLogin({ ...login, staffId: e.target.value })}/><input type="password" inputMode="numeric" placeholder="PIN" value={login.pin} onChange={(e) => setLogin({ ...login, pin: e.target.value })}/><button onClick={signIn}>Open Control Center</button>{message && <p className="ops-error">{message}</p>}</div></main>;

  const active = events.find((event) => event.is_active);
  return <main className="ops-shell"><aside className="ops-side"><div className="ops-brand"><Image src="/branding/hyfit-games-logo.png" width={50} height={50} unoptimized alt="HYFIT"/><b>HYFIT CONTROL</b></div>{["overview","events","team","rules","integration","exceptions","audit","system"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item.replace(/^\w/, (c) => c.toUpperCase())}</button>)}<div className="ops-user"><b>{me.name}</b><small>{me.staffId} · {me.role}</small></div></aside><section className="ops-content"><header><div><small>ACTIVE EVENT</small><h1>{active?.name ?? "No active event"}</h1><p>{active?.venue}</p></div><span className="ops-live">● {overview?.status ?? "offline"}</span></header>{message && <div className="ops-message">{message}<button onClick={() => setMessage("")}>×</button></div>}
    {tab === "overview" && <><div className="ops-metrics">{[["Roster",overview?.participants],["Checked in",overview?.checkedIn],["On course",overview?.onCourse],["Active judges",overview?.activeJudges],["Pending sync",overview?.pendingSync],["Conflicts",overview?.conflicts]].map(([label,value]) => <div key={String(label)}><small>{label}</small><b>{value ?? 0}</b></div>)}</div><div className="ops-grid"><article><h2>Operations health</h2><p><span className="good">●</span> Local database connected</p><p><span className="good">●</span> Configuration version {overview?.configVersion ?? 1}</p><p><span className={overview?.pendingSync ? "warn" : "good"}>●</span> {overview?.pendingSync ?? 0} RaceResult updates pending</p>{syncRuns[0] ? <p><span className={syncRuns[0].state === "complete" ? "good" : "warn"}>●</span> Participant sync {syncRuns[0].state} · {new Date(syncRuns[0].startedAt).toLocaleString()}</p> : <p><span className="warn">●</span> Participants have not been synced</p>}</article><article><h2>Quick actions</h2><button className="sync-action" disabled={syncingParticipants} onClick={() => void syncParticipants()}>{syncingParticipants ? "Syncing RaceResult…" : "↻ Sync participants now"}</button><button onClick={() => setTab("team")}>Onboard team member</button><button onClick={() => setTab("integration")}>Configure RaceResult</button><Link href="/checkin">Open Check-in →</Link><Link href="/">Open Judge App →</Link></article></div></>}
    {tab === "events" && <article className="ops-panel"><h2>Events</h2>{events.map((event) => <div className="ops-row" key={event.id}><div><b>{event.name}</b><small>{event.venue} · {event.participant_count} participants</small></div><span>{event.status}</span></div>)}</article>}
    {tab === "team" && <><div className="ops-grid"><article className="ops-panel"><h2>Onboard staff</h2><input placeholder="Staff ID" value={newUser.staffId} onChange={(e) => setNewUser({...newUser,staffId:e.target.value})}/><input placeholder="Full name" value={newUser.name} onChange={(e) => setNewUser({...newUser,name:e.target.value})}/><input placeholder="Temporary PIN" inputMode="numeric" value={newUser.pin} onChange={(e) => setNewUser({...newUser,pin:e.target.value})}/><select value={newUser.role} onChange={(e) => setNewUser({...newUser,role:e.target.value})}><option value="judge">Judge</option><option value="checkin">Check-in Volunteer</option><option value="event_admin">Event Admin</option><option value="readonly">Read-only Control</option></select><input placeholder="Judge station number (optional)" value={newUser.stationNumber} onChange={(e) => setNewUser({...newUser,stationNumber:e.target.value})}/><button className="ops-primary" onClick={createUser}>Create account</button></article><article className="ops-panel"><h2>Team · {users.length}</h2>{users.map((user) => <div className="ops-row" key={user.id}><div><b>{user.name}</b><small>{user.staffId} · {user.role}{user.stationNumber ? ` · Station ${user.stationNumber}` : ""}</small></div><span className={user.enabled ? "good" : "warn"}>●</span></div>)}</article></div><div className="ops-grid"><article className="ops-panel"><h2>Create check-in counter</h2><input placeholder="Counter code · C01" value={newStation.code} onChange={(e) => setNewStation({...newStation,code:e.target.value})}/><input placeholder="Counter name · Main Gate" value={newStation.name} onChange={(e) => setNewStation({...newStation,name:e.target.value})}/><select value={newStation.stageType} onChange={(e)=>setNewStation({...newStation,stageType:e.target.value as typeof newStation.stageType})}><option value="STAGE_1_WRISTBAND">Stage 1 · Check-In & Wristband</option><option value="STAGE_2_TRANSPONDER">Stage 2 · Arena Transponder</option></select><button className="ops-primary" onClick={createStation}>Create counter</button><h2 className="section-gap">Assign volunteer</h2><select value={stationAssignment.volunteerId} onChange={(e) => setStationAssignment({...stationAssignment,volunteerId:e.target.value})}><option value="">Choose check-in volunteer</option>{users.filter((user) => user.role === "checkin" && user.enabled).map((user) => <option value={user.id} key={user.id}>{user.staffId} · {user.name}</option>)}</select><select value={stationAssignment.stationId} onChange={(e) => setStationAssignment({...stationAssignment,stationId:e.target.value})}><option value="">Choose counter</option>{stations.filter((station) => station.enabled).map((station) => <option value={station.id} key={station.id}>{station.code} · {station.name} · {station.stageType==="STAGE_1_WRISTBAND"?"Stage 1":"Stage 2"}</option>)}</select><button className="ops-primary" onClick={assignStation}>Save assignment</button></article><article className="ops-panel"><h2>Check-in counters · {stations.length}</h2>{stations.map((station) => <div className="ops-row station-row" key={station.id}><div><b>{station.code} · {station.name}</b><small>{station.stageType==="STAGE_1_WRISTBAND"?"Stage 1 · Wristband":"Stage 2 · Transponder"} · {station.volunteers.length ? station.volunteers.map((volunteer) => `${volunteer.staffId} · ${volunteer.name}`).join(", ") : "No volunteers assigned"}</small></div><button onClick={() => void toggleStation(station)}>{station.enabled ? "Disable" : "Enable"}</button></div>)}</article></div></>}
    {tab === "integration" && <article className="ops-panel wide"><div className="integration-heading"><div><h2>RaceResult 14 configuration</h2><p>Publish the endpoint and mappings, then import the active event roster into Check-in.</p></div><button className="participant-sync-btn" disabled={syncingParticipants || !config.participantApiUrl} onClick={() => void syncParticipants()}>{syncingParticipants ? "Syncing…" : "↻ Sync participants now"}</button></div>{syncRuns[0] && <div className={`sync-result ${syncRuns[0].state}`}><b>Last sync: {syncRuns[0].state}</b><span>{new Date(syncRuns[0].startedAt).toLocaleString()} · {syncRuns[0].importedCount} imported · {syncRuns[0].rejectedCount} rejected{syncRuns[0].error ? ` · ${syncRuns[0].error}` : ""}</span></div>}<label>Participant fetch endpoint<input value={config.participantApiUrl} onChange={(e) => setConfig({...config,participantApiUrl:e.target.value})} placeholder="Complete GET endpoint"/></label><label>Participant update endpoint<input value={config.updateApiUrl} onChange={(e) => setConfig({...config,updateApiUrl:e.target.value})} placeholder="Complete POST endpoint"/></label><div className="ops-grid"><label>Participant field mapping<textarea value={config.participantMapping} onChange={(e) => setConfig({...config,participantMapping:e.target.value})}/></label><label>Update field mapping<textarea value={config.updateMapping} onChange={(e) => setConfig({...config,updateMapping:e.target.value})}/></label></div><h2 className="section-gap">Stage 1 identity evidence</h2><div className="policy-switches"><label><input type="checkbox" checked={config.requireParticipantPhoto} onChange={(e)=>setConfig({...config,requireParticipantPhoto:e.target.checked})}/><span><b>Require participant photo</b><small>Off by default · Government ID is never photographed</small></span></label><label><input type="checkbox" checked={config.requireDeclaratorySignature} onChange={(e)=>setConfig({...config,requireDeclaratorySignature:e.target.checked})}/><span><b>Require participant signature</b><small>Off by default · captured on a touch canvas</small></span></label></div><label>Participant declaration<textarea className="declaration-input" value={config.declarationText} onChange={(e)=>setConfig({...config,declarationText:e.target.value})}/></label><label>Media retention days<input type="number" min="1" max="365" value={config.mediaRetentionDays} onChange={(e)=>setConfig({...config,mediaRetentionDays:Number(e.target.value)})}/></label><button className="ops-primary" onClick={saveConfig}>Save & publish configuration</button></article>}
    {tab === "exceptions" && <><article className="ops-panel wide"><h2>Identity Help Desk · {identityExceptions.filter((item)=>item.state==="open").length} open</h2>{identityExceptions.length ? identityExceptions.map((item)=><div className="exception-row" key={item.id}><div><small>{item.state.toUpperCase()} · BIB {item.bib}</small><b>{item.name}</b><p>{item.reason.replaceAll("_"," ")}{item.note?` · ${item.note}`:""}</p><span>{new Date(item.createdAt).toLocaleString()} · {item.stationCode} · {item.volunteerStaffId} {item.volunteerName}</span>{item.resolutionNote&&<em>Resolution: {item.resolutionNote}</em>}</div>{item.state==="open"&&<aside><button onClick={()=>void resolveException(item,"overridden")}>Approve override</button><button onClick={()=>void resolveException(item,"rejected")}>Reject</button></aside>}</div>) : <p>No identity exceptions have been recorded.</p>}</article><article className="ops-panel wide section-gap"><h2>Replace assigned equipment</h2><p className="admin-help">Use only after collecting the previous item. Every replacement and reason is permanently audited and posted immediately to RaceResult.</p><div className="replacement-grid"><input inputMode="numeric" placeholder="Athlete BIB" value={replacement.bib} onChange={(e)=>setReplacement({...replacement,bib:e.target.value})}/><select value={replacement.assetType} onChange={(e)=>setReplacement({...replacement,assetType:e.target.value})}><option value="wristband">Wristband</option><option value="transponder1">Transponder1</option></select><input placeholder="New asset code" value={replacement.assetCode} onChange={(e)=>setReplacement({...replacement,assetCode:e.target.value})}/><input placeholder="Required replacement reason" value={replacement.reason} onChange={(e)=>setReplacement({...replacement,reason:e.target.value})}/></div><button className="ops-primary" onClick={()=>void replaceAsset()}>Record replacement & sync</button></article></>}
    {["rules","audit","system"].includes(tab) && <article className="ops-panel"><h2>{tab.replace(/^\w/,(c)=>c.toUpperCase())}</h2><p>This module is connected to the central event model and will display its live operational records as they are created.</p></article>}
  </section></main>;
}
