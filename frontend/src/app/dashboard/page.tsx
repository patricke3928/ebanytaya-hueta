"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { KanbanBoard } from "@/components/dashboard/KanbanBoard";
import { MyTasksWidget } from "@/components/dashboard/MyTasksWidget";
import { NotificationFeed } from "@/components/dashboard/NotificationFeed";
import { ProjectList } from "@/components/dashboard/ProjectList";
import { createProject, createTask, getBoard, getMe, getProjects, login, patchTask } from "@/lib/api";
import { connectProjectWS } from "@/lib/ws";
import type { Board, Project, Task, User } from "@/types/domain";

const DEMO_LOGIN = { username: "teamlead_anna", password: "hashed_password_example" };

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
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);

  const [newProjectName, setNewProjectName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Task["priority"]>("MEDIUM");

  useEffect(() => {
    (async () => {
      const accessToken = await login(DEMO_LOGIN.username, DEMO_LOGIN.password);
      setToken(accessToken);

      const [me, projectList] = await Promise.all([getMe(accessToken), getProjects(accessToken)]);
      setUser(me);
      setProjects(projectList);
      if (projectList.length > 0) {
        setSelectedProjectId(projectList[0].id);
      }
    })().catch((err) => {
      setNotifications((prev) => [`Startup failed: ${String(err)}`, ...prev]);
    });
  }, []);

  useEffect(() => {
    if (!token || !selectedProjectId) return;

    getBoard(token, selectedProjectId)
      .then(setBoard)
      .catch((err) => setNotifications((prev) => [`Board load failed: ${String(err)}`, ...prev]));

    const socket = connectProjectWS(selectedProjectId, token, (message) => {
      if (message.type === "task.updated" || message.type === "task.created") {
        setBoard((prev) => mergeTask(prev, message.task as Task));
        setNotifications((prev) => [`Task #${message.task.id} synced`, ...prev]);
      }
    });

    return () => socket.close();
  }, [token, selectedProjectId]);

  const myTasks = useMemo(() => {
    if (!user || !board) return [];
    const allTasks = Object.values(board.columns).flat();
    return allTasks.filter((task) => task.assignee_id === user.id);
  }, [user, board]);

  const currentProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    if (!token || !newProjectName.trim() || user?.role !== "LEAD") return;

    try {
      const project = await createProject(token, { name: newProjectName.trim() });
      setProjects((prev) => [project, ...prev]);
      setSelectedProjectId(project.id);
      setNewProjectName("");
      setNotifications((prev) => [`Project created: ${project.name}`, ...prev]);
    } catch (err) {
      setNotifications((prev) => [`Create project failed: ${String(err)}`, ...prev]);
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
      setNotifications((prev) => [`Task created: #${task.id}`, ...prev]);
    } catch (err) {
      setNotifications((prev) => [`Create task failed: ${String(err)}`, ...prev]);
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
      setNotifications((prev) => [`Task #${task.id} -> ${nextStatus}`, ...prev]);
    } catch (err) {
      setNotifications((prev) => [`Move failed for #${task.id}: ${String(err)}`, ...prev]);
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <div className="page">
      <main className="shell">
        <ProjectList projects={projects} selectedProjectId={selectedProjectId} onSelect={setSelectedProjectId} />

        <section>
          <div className="panel top-card">
            <div>
              <h1 className="heading">Nexus OS Dashboard</h1>
              <p className="subtle">
                {currentProject ? `Project: ${currentProject.name}` : "No project selected"}
              </p>
            </div>
            <span className="pill">
              {user?.username ?? "-"} / {user?.role ?? "-"}
            </span>
          </div>

          {user?.role === "LEAD" ? (
            <div className="panel" style={{ marginBottom: 16 }}>
              <h3 className="section-title">Quick Actions</h3>
              <div className="action-grid">
                <form onSubmit={handleCreateProject} className="action-form">
                  <label className="subtle">Create project</label>
                  <input
                    className="text-input"
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder="Project name"
                  />
                  <button className="primary-btn" type="submit">
                    Add Project
                  </button>
                </form>

                <form onSubmit={handleCreateTask} className="action-form">
                  <label className="subtle">Create task in current project</label>
                  <input
                    className="text-input"
                    value={newTaskTitle}
                    onChange={(event) => setNewTaskTitle(event.target.value)}
                    placeholder="Task title"
                  />
                  <select
                    className="text-input"
                    value={newTaskPriority}
                    onChange={(event) => setNewTaskPriority(event.target.value as Task["priority"])}
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                  <button className="primary-btn" type="submit" disabled={!selectedProjectId}>
                    Add Task
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          <MyTasksWidget tasks={myTasks} />
          <KanbanBoard
            board={board}
            currentUserId={user?.id ?? null}
            currentUserRole={user?.role ?? null}
            onMoveTask={handleMoveTask}
            busyTaskId={busyTaskId}
          />
        </section>

        <NotificationFeed notifications={notifications} />
      </main>
    </div>
  );
}
