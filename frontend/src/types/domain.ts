export type User = {
  id: number;
  username: string;
  email: string;
  role: "LEAD" | "DEV" | "PO";
};

export type Project = {
  id: number;
  name: string;
  description: string | null;
  lead_id: number;
};

export type Task = {
  id: number;
  project_id: number;
  title: string;
  status: "BACKLOG" | "TODO" | "DOING" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignee_id: number | null;
  parent_task_id: number | null;
};

export type Board = {
  project_id: number;
  columns: Record<"BACKLOG" | "TODO" | "DOING" | "DONE", Task[]>;
};
