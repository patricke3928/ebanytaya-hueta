"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { KanbanBoard } from "@/components/dashboard/KanbanBoard";
import { MyTasksWidget } from "@/components/dashboard/MyTasksWidget";
import { NotificationFeed } from "@/components/dashboard/NotificationFeed";
import { ProjectList } from "@/components/dashboard/ProjectList";
import { createProject, createTask, getBoard, getMe, getProjects, getUsers, login, patchTask } from "@/lib/api";
import { dictionaries, type Lang } from "@/lib/i18n";
import { connectProjectWS } from "@/lib/ws";
import type { Board, Project, Task, User } from "@/types/domain";

function mergeTask(board: Board | null, nextTask: Task): Board | null {
  if (!board || board.project_id !== nextTask.project_id) {
    return board;
  }

  const columns = { ...board.columns };
  for (const key of Object.keys(columns) as Array<keyof typeof columns>) {
    columns[key] = columns[key].filter((task) => task.id !== nextTask.id);
  }

  columns[nextTask.status] = [...columns[nextTask.status], nextTask];
  return { ...board, columns };
}

const NEXT_STATUS: Record<Task["status"], Task["status"]> = {
  BACKLOG: "TODO",
  TODO: "DOING",
  DOING: "DONE",
  DONE: "DONE",
};

export default function DashboardPage() {
  const [lang, setLang] = useState<Lang>("ru");
  const t = dictionaries[lang];

  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<Array<Pick<User, "id" | "username" | "role">>>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);

  const [newProjectName, setNewProjectName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Task["priority"]>("MEDIUM");

  const [username, setUsername] = useState("teamlead_anna");
  const [password, setPassword] = useState("hashed_password_example");

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
    window.localStorage.setItem("nexus_lang", lang);
  }, [lang]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setProjects([]);
      setBoard(null);
      setIsWorkspaceLoading(false);
      return;
    }

    setIsWorkspaceLoading(true);
    (async () => {
      const [me, projectList, teamUsers] = await Promise.all([getMe(token), getProjects(token), getUsers(token)]);
      setUser(me);
      setProjects(projectList);
      setUsers(teamUsers);
      if (projectList.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projectList[0].id);
      }
    })().catch((err) => {
      setNotifications((prev) => [`${t.startupFailed}: ${String(err)}`, ...prev]);
      setToken("");
      window.localStorage.removeItem("nexus_token");
    }).finally(() => {
      setIsWorkspaceLoading(false);
    });
    // selectedProjectId is intentionally excluded to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, t.startupFailed]);

  useEffect(() => {
    if (!token || !selectedProjectId) return;

    setIsBoardLoading(true);
    setBoardError(null);
    getBoard(token, selectedProjectId)
      .then(setBoard)
      .catch((err) => {
        setBoardError(`${t.boardLoadFailed}: ${String(err)}`);
        setNotifications((prev) => [`${t.boardLoadFailed}: ${String(err)}`, ...prev]);
      })
      .finally(() => {
        setIsBoardLoading(false);
      });

    const socket = connectProjectWS(selectedProjectId, token, (message) => {
      if (message.type === "task.updated" || message.type === "task.created") {
        setBoard((prev) => mergeTask(prev, message.task as Task));
        setNotifications((prev) => [`${t.taskSynced}: #${message.task.id}`, ...prev]);
      }
    });

    return () => socket.close();
  }, [token, selectedProjectId, t.boardLoadFailed, t.taskSynced]);

  const myTasks = useMemo(() => {
    if (!user || !board) return [];
    const allTasks = Object.values(board.columns).flat();
    return allTasks.filter((task) => task.assignee_id === user.id);
  }, [user, board]);

  const currentProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    try {
      setIsAuthLoading(true);
      const accessToken = await login(username, password);
      setToken(accessToken);
      window.localStorage.setItem("nexus_token", accessToken);
      setNotifications([]);
    } catch (err) {
      setNotifications([`${t.loginFailed}: ${String(err)}`]);
    } finally {
      setIsAuthLoading(false);
    }
  }

  function handleSignOut() {
    setToken("");
    setUser(null);
    setUsers([]);
    setProjects([]);
    setSelectedProjectId(null);
    setBoard(null);
    window.localStorage.removeItem("nexus_token");
  }

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    if (!token || !newProjectName.trim() || user?.role !== "LEAD") return;

    try {
      const project = await createProject(token, { name: newProjectName.trim() });
      setProjects((prev) => [project, ...prev]);
      setSelectedProjectId(project.id);
      setNewProjectName("");
      setNotifications((prev) => [`${t.projectCreated}: ${project.name}`, ...prev]);
    } catch (err) {
      setNotifications((prev) => [`${t.createProjectFailed}: ${String(err)}`, ...prev]);
    }
  }

  async function handleCreateTask(event: FormEvent) {
    event.preventDefault();
    if (!token || !selectedProjectId || !newTaskTitle.trim() || user?.role !== "LEAD") return;

    try {
      const task = await createTask(token, {
        project_id: selectedProjectId,
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        status: "TODO",
      });
      setBoard((prev) => mergeTask(prev, task));
      setNewTaskTitle("");
      setNotifications((prev) => [`${t.taskCreated}: #${task.id}`, ...prev]);
    } catch (err) {
      setNotifications((prev) => [`${t.createTaskFailed}: ${String(err)}`, ...prev]);
    }
  }

  async function handleMoveTask(task: Task) {
    if (!token) return;
    const nextStatus = NEXT_STATUS[task.status];
    if (nextStatus === task.status) return;

    setBusyTaskId(task.id);
    try {
      const updated = await patchTask(token, task.id, { status: nextStatus });
      setBoard((prev) => mergeTask(prev, updated));
      setNotifications((prev) => [`#${task.id}: ${t.moveTo} ${t.statusLabels[nextStatus]}`, ...prev]);
    } catch (err) {
      setNotifications((prev) => [`${t.moveFailed} #${task.id}: ${String(err)}`, ...prev]);
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleUpdateTask(task: Task, patch: Partial<Task>) {
    if (!token) return;
    setBusyTaskId(task.id);
    try {
      const updated = await patchTask(token, task.id, patch);
      setBoard((prev) => mergeTask(prev, updated));
      setNotifications((prev) => [`${t.updateTask}: #${task.id}`, ...prev]);
    } catch (err) {
      setNotifications((prev) => [`${t.moveFailed} #${task.id}: ${String(err)}`, ...prev]);
    } finally {
      setBusyTaskId(null);
    }
  }

  if (!token || !user) {
    return (
      <div className="page auth-page">
        <section className="panel auth-card">
          <h1 className="heading" style={{ fontSize: 28 }}>
            {t.loginTitle}
          </h1>
          <p className="subtle" style={{ marginBottom: 12 }}>
            {t.loginSubtitle}
          </p>
          <form onSubmit={handleSignIn} className="action-form">
            <label className="subtle">{t.username}</label>
            <input className="text-input" value={username} onChange={(event) => setUsername(event.target.value)} />
            <label className="subtle">{t.password}</label>
            <input
              className="text-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="primary-btn" type="submit" disabled={isAuthLoading}>
              {isAuthLoading ? t.loading : t.signIn}
            </button>
          </form>
          <div className="lang-switch" aria-label={t.language} style={{ marginTop: 12 }}>
            <button type="button" className={`lang-btn ${lang === "ru" ? "active" : ""}`} onClick={() => setLang("ru")}>
              RU
            </button>
            <button type="button" className={`lang-btn ${lang === "en" ? "active" : ""}`} onClick={() => setLang("en")}>
              EN
            </button>
          </div>
          {notifications.length > 0 ? <p className="empty" style={{ marginTop: 10 }}>{notifications[0]}</p> : null}
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <main className="shell">
        <ProjectList
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
          title={t.projects}
        />

        <section>
          <div className="panel top-card">
            <div>
              <h1 className="heading">{t.dashboardTitle}</h1>
              <p className="subtle">
                {currentProject ? `${t.projectLabel}: ${currentProject.name}` : t.noProjectSelected}
              </p>
              <p className="context-hint">
                {user.role === "LEAD" ? t.roleLeadHint : user.role === "DEV" ? t.roleDevHint : t.rolePoHint}
              </p>
              {selectedProjectId ? (
                <p style={{ marginTop: 8, marginBottom: 0, display: "flex", gap: 12 }}>
                  <Link href={`/projects/${selectedProjectId}`} className="link-btn">
                    {t.openProjectPage}
                  </Link>
                  <Link href="/core" className="link-btn">
                    {t.openCore}
                  </Link>
                </p>
              ) : null}
            </div>
            <div className="top-card-right">
              <span className="pill">
                {t.user}: {user.username} / {user.role}
              </span>
              <div className="top-actions">
                <div className="lang-switch" aria-label={t.language}>
                  <button
                    type="button"
                    className={`lang-btn ${lang === "ru" ? "active" : ""}`}
                    onClick={() => setLang("ru")}
                  >
                    RU
                  </button>
                  <button
                    type="button"
                    className={`lang-btn ${lang === "en" ? "active" : ""}`}
                    onClick={() => setLang("en")}
                  >
                    EN
                  </button>
                </div>
                <button className="secondary-btn" type="button" onClick={handleSignOut}>
                  {t.signOut}
                </button>
              </div>
            </div>
          </div>

          {user.role === "LEAD" ? (
            <div className="panel" style={{ marginBottom: 16 }}>
              <h3 className="section-title">{t.quickActions}</h3>
              <div className="action-grid">
                <form onSubmit={handleCreateProject} className="action-form">
                  <label className="subtle">{t.createProject}</label>
                  <input
                    className="text-input"
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder={t.projectName}
                  />
                  <button className="primary-btn" type="submit" disabled={!newProjectName.trim()}>
                    {t.addProject}
                  </button>
                </form>

                <form onSubmit={handleCreateTask} className="action-form">
                  <label className="subtle">{t.createTaskCurrentProject}</label>
                  <input
                    className="text-input"
                    value={newTaskTitle}
                    onChange={(event) => setNewTaskTitle(event.target.value)}
                    placeholder={t.taskTitle}
                  />
                  <select
                    className="text-input"
                    value={newTaskPriority}
                    onChange={(event) => setNewTaskPriority(event.target.value as Task["priority"])}
                  >
                    <option value="LOW">{t.priorityLabels.LOW}</option>
                    <option value="MEDIUM">{t.priorityLabels.MEDIUM}</option>
                    <option value="HIGH">{t.priorityLabels.HIGH}</option>
                    <option value="CRITICAL">{t.priorityLabels.CRITICAL}</option>
                  </select>
                  <button
                    className="primary-btn"
                    type="submit"
                    disabled={!selectedProjectId || !newTaskTitle.trim()}
                    title={!selectedProjectId ? t.projectRequiredHint : ""}
                  >
                    {t.addTask}
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {isWorkspaceLoading ? (
            <section className="panel" style={{ marginBottom: 16 }}>
              <p className="empty">{t.loadingWorkspace}</p>
            </section>
          ) : null}

          {!isWorkspaceLoading && projects.length === 0 ? (
            <section className="panel" style={{ marginBottom: 16 }}>
              <p className="empty">{t.noProjectsHint}</p>
            </section>
          ) : null}

          {boardError ? (
            <section className="panel panel-error" style={{ marginBottom: 16 }}>
              <p className="empty">{boardError}</p>
            </section>
          ) : null}

          {isBoardLoading ? (
            <section className="panel" style={{ marginBottom: 16 }}>
              <p className="empty">{t.loadingBoard}</p>
            </section>
          ) : null}

          <MyTasksWidget
            tasks={myTasks}
            title={t.myTasks}
            emptyText={t.noAssignedTasks}
            statusLabels={t.statusLabels}
            priorityLabels={t.priorityLabels}
          />
          <KanbanBoard
            board={board}
            currentUserId={user.id}
            currentUserRole={user.role}
            onMoveTask={handleMoveTask}
            onUpdateTask={handleUpdateTask}
            busyTaskId={busyTaskId}
            title={t.kanbanBoard}
            noBoardText={t.noBoardSelected}
            noTasksText={t.noTasks}
            moveToText={t.moveTo}
            updateTaskText={t.updateTask}
            assigneeText={t.assignee}
            unassignedText={t.unassigned}
            saveText={t.save}
            savingText={t.saving}
            noPermissionMoveDevText={t.noPermissionMoveDev}
            noPermissionMovePoText={t.noPermissionMovePo}
            noPermissionEditText={t.noPermissionEdit}
            statusLabels={t.statusLabels}
            priorityLabels={t.priorityLabels}
            users={users}
          />
        </section>

        <NotificationFeed notifications={notifications} title={t.notifications} emptyText={t.noRecentEvents} />
      </main>
    </div>
  );
}
