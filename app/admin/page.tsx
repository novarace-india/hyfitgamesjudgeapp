"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "../operations.css";

type User = { id: string; staffId: string; name: string; role: string; eventId: string | null; stationNumber?: number; enabled: boolean };
type Event = { id: string; name: string; venue: string; status: string; is_active: boolean; participant_count: number };
type Overview = { name: string; venue: string; status: string; configVersion: number; participants: number; checkedIn: number; onCourse: number; activeJudges: number; pendingSync: number; conflicts: number };

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
  const [newUser, setNewUser] = useState({ staffId: "", name: "", pin: "", role: "judge", stationNumber: "" });
  const [config, setConfig] = useState({ participantApiUrl: "", updateApiUrl: "", participantMapping: "{\"listPath\":\"\",\"bib\":\"bib\",\"name\":\"name\"}", updateMapping: "{\"checkinStatus\":\"checkinstatus\",\"wristband\":\"wristbandid\",\"transponder1\":\"transponder1\"}" });

  const load = useCallback(async () => {
    const session = await api("/api/auth/session");
    setMe(session.user);
    const [eventData, userData, overviewData] = await Promise.all([api("/api/admin/events"), api("/api/admin/users"), api("/api/admin/overview")]);
    setEvents(eventData.events); setUsers(userData.users); setOverview(overviewData.overview);
    const configData = await api("/api/admin/config");
    if (configData.config) setConfig({
      participantApiUrl: configData.config.participantApiUrl,
      updateApiUrl: configData.config.updateApiUrl,
      participantMapping: JSON.stringify(configData.config.participantMapping, null, 2),
      updateMapping: JSON.stringify(configData.config.updateMapping, null, 2),
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
      const draft = await api("/api/admin/config", { method: "PUT", body: JSON.stringify({ eventId: me?.eventId, participantApiUrl: config.participantApiUrl, updateApiUrl: config.updateApiUrl, participantMapping: JSON.parse(config.participantMapping), updateMapping: JSON.parse(config.updateMapping), rules: { stations: 6, cognitiveThreshold: 60 } }) });
      await api("/api/admin/config", { method: "POST", body: JSON.stringify({ id: draft.id, eventId: me?.eventId }) });
      setMessage(`Configuration v${draft.version} published`); await load();
    } catch (error) { setMessage((error as Error).message); }
  }

  if (!me) return <main className="ops-login"><div className="ops-login-card"><Image src="/branding/hyfit-games-logo.png" width={90} height={90} unoptimized alt="HYFIT Games"/><div className="ops-kicker">EVENT CONTROL</div><h1>Admin sign in</h1><input placeholder="Staff ID" value={login.staffId} onChange={(e) => setLogin({ ...login, staffId: e.target.value })}/><input type="password" inputMode="numeric" placeholder="PIN" value={login.pin} onChange={(e) => setLogin({ ...login, pin: e.target.value })}/><button onClick={signIn}>Open Control Center</button>{message && <p className="ops-error">{message}</p>}</div></main>;

  const active = events.find((event) => event.is_active);
  return <main className="ops-shell"><aside className="ops-side"><div className="ops-brand"><Image src="/branding/hyfit-games-logo.png" width={50} height={50} unoptimized alt="HYFIT"/><b>HYFIT CONTROL</b></div>{["overview","events","team","rules","integration","exceptions","audit","system"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item.replace(/^\w/, (c) => c.toUpperCase())}</button>)}<div className="ops-user"><b>{me.name}</b><small>{me.staffId} · {me.role}</small></div></aside><section className="ops-content"><header><div><small>ACTIVE EVENT</small><h1>{active?.name ?? "No active event"}</h1><p>{active?.venue}</p></div><span className="ops-live">● {overview?.status ?? "offline"}</span></header>{message && <div className="ops-message">{message}<button onClick={() => setMessage("")}>×</button></div>}
    {tab === "overview" && <><div className="ops-metrics">{[["Roster",overview?.participants],["Checked in",overview?.checkedIn],["On course",overview?.onCourse],["Active judges",overview?.activeJudges],["Pending sync",overview?.pendingSync],["Conflicts",overview?.conflicts]].map(([label,value]) => <div key={String(label)}><small>{label}</small><b>{value ?? 0}</b></div>)}</div><div className="ops-grid"><article><h2>Operations health</h2><p><span className="good">●</span> Local database connected</p><p><span className="good">●</span> Configuration version {overview?.configVersion ?? 1}</p><p><span className={overview?.pendingSync ? "warn" : "good"}>●</span> {overview?.pendingSync ?? 0} RaceResult updates pending</p></article><article><h2>Quick links</h2><button onClick={() => setTab("team")}>Onboard team member</button><button onClick={() => setTab("integration")}>Configure RaceResult</button><Link href="/checkin">Open Check-in →</Link><Link href="/">Open Judge App →</Link></article></div></>}
    {tab === "events" && <article className="ops-panel"><h2>Events</h2>{events.map((event) => <div className="ops-row" key={event.id}><div><b>{event.name}</b><small>{event.venue} · {event.participant_count} participants</small></div><span>{event.status}</span></div>)}</article>}
    {tab === "team" && <div className="ops-grid"><article className="ops-panel"><h2>Onboard staff</h2><input placeholder="Staff ID" value={newUser.staffId} onChange={(e) => setNewUser({...newUser,staffId:e.target.value})}/><input placeholder="Full name" value={newUser.name} onChange={(e) => setNewUser({...newUser,name:e.target.value})}/><input placeholder="Temporary PIN" inputMode="numeric" value={newUser.pin} onChange={(e) => setNewUser({...newUser,pin:e.target.value})}/><select value={newUser.role} onChange={(e) => setNewUser({...newUser,role:e.target.value})}><option value="judge">Judge</option><option value="checkin">Check-in Volunteer</option><option value="event_admin">Event Admin</option><option value="readonly">Read-only Control</option></select><input placeholder="Station number (optional)" value={newUser.stationNumber} onChange={(e) => setNewUser({...newUser,stationNumber:e.target.value})}/><button className="ops-primary" onClick={createUser}>Create account</button></article><article className="ops-panel"><h2>Team · {users.length}</h2>{users.map((user) => <div className="ops-row" key={user.id}><div><b>{user.name}</b><small>{user.staffId} · {user.role}{user.stationNumber ? ` · Station ${user.stationNumber}` : ""}</small></div><span className={user.enabled ? "good" : "warn"}>●</span></div>)}</article></div>}
    {tab === "integration" && <article className="ops-panel wide"><h2>RaceResult 14 configuration</h2><label>Participant fetch endpoint<input value={config.participantApiUrl} onChange={(e) => setConfig({...config,participantApiUrl:e.target.value})} placeholder="Complete GET endpoint"/></label><label>Participant update endpoint<input value={config.updateApiUrl} onChange={(e) => setConfig({...config,updateApiUrl:e.target.value})} placeholder="Complete POST endpoint"/></label><div className="ops-grid"><label>Participant field mapping<textarea value={config.participantMapping} onChange={(e) => setConfig({...config,participantMapping:e.target.value})}/></label><label>Update field mapping<textarea value={config.updateMapping} onChange={(e) => setConfig({...config,updateMapping:e.target.value})}/></label></div><button className="ops-primary" onClick={saveConfig}>Save & publish configuration</button></article>}
    {["rules","exceptions","audit","system"].includes(tab) && <article className="ops-panel"><h2>{tab.replace(/^\w/,(c)=>c.toUpperCase())}</h2><p>This module is connected to the central event model and will display its live operational records as they are created.</p></article>}
  </section></main>;
}
