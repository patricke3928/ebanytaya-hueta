"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getBoard, getMe, getUsers, patchTask } from "@/lib/api";
import { dictionaries, type Lang } from "@/lib/i18n";
import type { Task, User } from "@/types/domain";

const STATUSES: Task["status"][] = ["BACKLOG", "TODO", "DOING", "DONE"];

export default function ProjectBoardPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [lang, setLang] = useState<Lang>("ru");
  const t = dictionaries[lang];

  const [token, setToken] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<Array<Pick<User, "id" | "username" | "role">>>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | Task["status"]>("ALL");
  const [selectedAssignee, setSelectedAssignee] = useState<number | "ALL">("ALL");
  const [isLoading, setIsLoading] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedLang = window.localStorage.getItem("nexus_lang");
    if (savedLang === "ru" || savedLang === "en") {
      setLang(savedLang);
    }
    const savedToken = window.localStorage.getItem("nexus_token");
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (!token || !projectId) return;

    setIsLoading(true);
    setError(null);
    Promise.all([getMe(token), getBoard(token, projectId), getUsers(token)])
      .then(([me, board, teamUsers]) => {
        setCurrentUser(me);
        setUsers(teamUsers);
        const list = Object.values(board.columns).flat();
        setTasks(list);
      })
      .catch((err) => {
        setError(`${t.boardFailed} ${String(err)}`);
        setTasks([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token, projectId, t.boardFailed]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const byStatus = selectedStatus === "ALL" || task.status === selectedStatus;
      const byAssignee = selectedAssignee === "ALL" || task.assignee_id === selectedAssignee;
      return byStatus && byAssignee;
    });
  }, [tasks, selectedStatus, selectedAssignee]);

  async function moveTask(task: Task) {
    if (!token || !currentUser) return;
    const nextStatus: Record<Task["status"], Task["status"]> = {
      BACKLOG: "TODO",
      TODO: "DOING",
      DOING: "DONE",
      DONE: "DONE",
    };
    if (task.status === "DONE") return;
    if (currentUser.role === "PO") return;
    if (currentUser.role === "DEV" && task.assignee_id !== currentUser.id) return;

    setBusyTaskId(task.id);
    try {
      const updated = await patchTask(token, task.id, { status: nextStatus[task.status] });
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(`${t.moveFailed}: ${String(err)}`);
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <div className="page">
      <section className="panel" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0 }}>
          <Link href="/dashboard" className="link-btn">
            ← {t.backToDashboard}
          </Link>
        </p>
        <h1 className="heading" style={{ fontSize: 28, marginTop: 8 }}>
          {t.projectBoardTitle} #{projectId}
        </h1>
        {currentUser ? (
          <p className="context-hint">
            {currentUser.role === "LEAD" ? t.roleLeadHint : currentUser.role === "DEV" ? t.roleDevHint : t.rolePoHint}
          </p>
        ) : null}
        <div className="top-actions">
          <div className="lang-switch" aria-label={t.language}>
            <button type="button" className={`lang-btn ${lang === "ru" ? "active" : ""}`} onClick={() => setLang("ru")}>
              RU
            </button>
            <button type="button" className={`lang-btn ${lang === "en" ? "active" : ""}`} onClick={() => setLang("en")}>
              EN
            </button>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="action-grid">
          <div className="action-form">
            <label className="subtle">{t.filterByStatus}</label>
            <select
              className="text-input"
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value as "ALL" | Task["status"])}
            >
              <option value="ALL">{t.allStatuses}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t.statusLabels[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="action-form">
            <label className="subtle">{t.filterByAssignee}</label>
            <select
              className="text-input"
              value={selectedAssignee}
              onChange={(event) => {
                setSelectedAssignee(event.target.value === "ALL" ? "ALL" : Number(event.target.value));
              }}
            >
              <option value="ALL">{t.allAssignees}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {!token ? (
        <section className="panel panel-error" style={{ marginBottom: 16 }}>
          <p className="empty">{t.loginRequired}</p>
        </section>
      ) : null}

      {error ? (
        <section className="panel panel-error" style={{ marginBottom: 16 }}>
          <p className="empty">{error}</p>
        </section>
      ) : null}

      {isLoading ? (
        <section className="panel skeleton-block" style={{ marginBottom: 16 }}>
          <div className="skeleton skeleton-line lg" />
          <div className="skeleton skeleton-line md" />
          <div className="skeleton skeleton-line sm" />
        </section>
      ) : null}

      <section className="panel">
        <ul className="task-list">
          {filteredTasks.map((task) => (
            <li key={task.id} className="task-item">
              <p className="task-name">{task.title}</p>
              <div className="meta-row">
                <span className={`badge status-${task.status.toLowerCase()}`}>{t.statusLabels[task.status]}</span>
                <span className={`badge prio-${task.priority.toLowerCase()}`}>{t.priorityLabels[task.priority]}</span>
              </div>
              <div className="meta-row" style={{ marginTop: 8 }}>
                <button
                  className="primary-btn"
                  type="button"
                  disabled={
                    task.status === "DONE" ||
                    busyTaskId === task.id ||
                    currentUser?.role === "PO" ||
                    (currentUser?.role === "DEV" && task.assignee_id !== currentUser.id)
                  }
                  title={
                    currentUser?.role === "PO"
                      ? t.noPermissionMovePo
                      : currentUser?.role === "DEV" && task.assignee_id !== currentUser.id
                        ? t.noPermissionMoveDev
                        : ""
                  }
                  onClick={() => moveTask(task)}
                >
                  {t.moveTo}
                </button>
              </div>
            </li>
          ))}
          {filteredTasks.length === 0 ? <li className="empty">{t.noTasks}</li> : null}
        </ul>
      </section>
    </div>
  );
}
