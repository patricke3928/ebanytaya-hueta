"use client";

import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

type CoreSession = {
  id: number;
  project_id: number;
  name: string;
  created_at: string;
};

export default function CorePage() {
  const [token, setToken] = useState("");
  const [projectId, setProjectId] = useState("1");
  const [name, setName] = useState("Pair Session");
  const [sessions, setSessions] = useState<CoreSession[]>([]);
  const [activeSession, setActiveSession] = useState<number | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem("nexus_token");
    if (saved) {
      setToken(saved);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/core/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data: CoreSession[]) => setSessions(data))
      .catch(() => setSessions([]));
  }, [token]);

  useEffect(() => {
    if (!token || !activeSession) return;
    const ws = new WebSocket(`${WS_URL}/ws/core/sessions/${activeSession}?token=${encodeURIComponent(token)}`);
    ws.onmessage = (event) => {
      setEvents((prev) => [event.data, ...prev].slice(0, 30));
    };
    return () => ws.close();
  }, [token, activeSession]);

  async function createSession(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/core/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ project_id: Number(projectId), name }),
    });
    if (!res.ok) return;
    const next = (await res.json()) as CoreSession;
    setSessions((prev) => [next, ...prev]);
    setActiveSession(next.id);
  }

  return (
    <div className="page">
      <section className="panel" style={{ marginBottom: 16 }}>
        <h1 className="heading" style={{ fontSize: 28 }}>The Core (Realtime Skeleton)</h1>
        <p className="subtle">In-memory collaborative sessions + WebSocket event stream.</p>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <form onSubmit={createSession} className="action-grid">
          <input className="text-input" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project ID" />
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Session name" />
          <button type="submit" className="primary-btn">Create session</button>
        </form>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h3 className="section-title">Sessions</h3>
        <ul className="task-list">
          {sessions.map((session) => (
            <li key={session.id} className="task-item">
              <p className="task-name">#{session.id} {session.name}</p>
              <div className="meta-row">
                <span className="badge status-todo">Project {session.project_id}</span>
              </div>
              <button className="primary-btn" onClick={() => setActiveSession(session.id)} style={{ marginTop: 8 }}>
                Connect
              </button>
            </li>
          ))}
          {sessions.length === 0 ? <li className="empty">No sessions yet.</li> : null}
        </ul>
      </section>

      <section className="panel">
        <h3 className="section-title">Realtime events {activeSession ? `(session #${activeSession})` : ""}</h3>
        <ul className="feed-list">
          {events.map((event, idx) => (
            <li key={`${event}-${idx}`}>{event}</li>
          ))}
          {events.length === 0 ? <li className="empty">No events.</li> : null}
        </ul>
      </section>
    </div>
  );
}
