"use client";

import { useEffect, useMemo, useState } from "react";

import { KanbanBoard } from "@/components/dashboard/KanbanBoard";
import { MyTasksWidget } from "@/components/dashboard/MyTasksWidget";
import { NotificationFeed } from "@/components/dashboard/NotificationFeed";
import { ProjectList } from "@/components/dashboard/ProjectList";
import { getBoard, getMe, getProjects, login } from "@/lib/api";
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

export default function DashboardPage() {
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);

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
      if (message.type === "task.updated") {
        setBoard((prev) => mergeTask(prev, message.task as Task));
        setNotifications((prev) => [`Task #${message.task.id} updated`, ...prev]);
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

          <MyTasksWidget tasks={myTasks} />
          <KanbanBoard board={board} />
        </section>

        <NotificationFeed notifications={notifications} />
      </main>
    </div>
  );
}
