import type { Board, Project, Task, User } from "@/types/domain";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error("Login failed");
  }
  const data = await res.json();
  return data.access_token;
}

export async function getMe(token: string): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/me`, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new Error("Failed to fetch profile");
  }
  return res.json();
}

export async function getProjects(token: string): Promise<Project[]> {
  const res = await fetch(`${API_URL}/api/projects`, { headers: authHeaders(token), cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to fetch projects");
  }
  return res.json();
}

export async function getBoard(token: string, projectId: number): Promise<Board> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/board`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch board");
  }
  return res.json();
}

export async function patchTask(token: string, taskId: number, patch: Partial<Task>): Promise<Task> {
  const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error("Failed to patch task");
  }
  return res.json();
}

export async function createProject(token: string, payload: { name: string; description?: string }): Promise<Project> {
  const res = await fetch(`${API_URL}/api/projects`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("Failed to create project");
  }
  return res.json();
}

export async function createTask(
  token: string,
  payload: {
    project_id: number;
    title: string;
    status?: Task["status"];
    priority?: Task["priority"];
    assignee_id?: number | null;
    parent_task_id?: number | null;
  },
): Promise<Task> {
  const res = await fetch(`${API_URL}/api/tasks`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("Failed to create task");
  }
  return res.json();
}
