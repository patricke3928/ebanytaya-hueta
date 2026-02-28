import { useEffect, useState } from "react";

import type { Task, User } from "@/types/domain";

import type { Board } from "@/types/domain";

const COLUMNS = ["BACKLOG", "TODO", "DOING", "DONE"] as const;

type Props = {
  board: Board | null;
  currentUserId: number | null;
  currentUserRole: "LEAD" | "DEV" | "PO" | null;
  onMoveTask: (task: Task) => void;
  onUpdateTask: (task: Task, patch: Partial<Task>) => void;
  busyTaskId: number | null;
  title: string;
  noBoardText: string;
  noTasksText: string;
  moveToText: string;
  updateTaskText: string;
  assigneeText: string;
  unassignedText: string;
  saveText: string;
  savingText: string;
  noPermissionMoveDevText: string;
  noPermissionMovePoText: string;
  noPermissionEditText: string;
  statusLabels: Record<Task["status"], string>;
  priorityLabels: Record<Task["priority"], string>;
  users: Array<Pick<User, "id" | "username" | "role">>;
};

function statusClass(status: Task["status"]) {
  return `status-${status.toLowerCase()}`;
}

function priorityClass(priority: Task["priority"]) {
  return `prio-${priority.toLowerCase()}`;
}

const NEXT_STATUS: Record<Task["status"], Task["status"]> = {
  BACKLOG: "TODO",
  TODO: "DOING",
  DOING: "DONE",
  DONE: "DONE",
};

function TaskEditRow({
  task,
  users,
  onSave,
  busy,
  updateTaskText,
  assigneeText,
  unassignedText,
  saveText,
  savingText,
  priorityLabels,
}: {
  task: Task;
  users: Array<Pick<User, "id" | "username" | "role">>;
  onSave: (task: Task, patch: Partial<Task>) => void;
  busy: boolean;
  updateTaskText: string;
  assigneeText: string;
  unassignedText: string;
  saveText: string;
  savingText: string;
  priorityLabels: Record<Task["priority"], string>;
}) {
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState<Task["priority"]>(task.priority);
  const [assigneeId, setAssigneeId] = useState<number | null>(task.assignee_id);
  const isChanged = title !== task.title || priority !== task.priority || assigneeId !== task.assignee_id;

  useEffect(() => {
    setTitle(task.title);
    setPriority(task.priority);
    setAssigneeId(task.assignee_id);
  }, [task.assignee_id, task.priority, task.title]);

  return (
    <div className="task-edit-box">
      <p className="task-edit-title">{updateTaskText}</p>
      <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} />
      <select
        className="text-input"
        value={priority}
        onChange={(event) => setPriority(event.target.value as Task["priority"])}
      >
        <option value="LOW">{priorityLabels.LOW}</option>
        <option value="MEDIUM">{priorityLabels.MEDIUM}</option>
        <option value="HIGH">{priorityLabels.HIGH}</option>
        <option value="CRITICAL">{priorityLabels.CRITICAL}</option>
      </select>
      <label className="subtle" style={{ fontSize: 12 }}>
        {assigneeText}
      </label>
      <select
        className="text-input"
        value={assigneeId ?? ""}
        onChange={(event) => setAssigneeId(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">{unassignedText}</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.username} ({user.role})
          </option>
        ))}
      </select>
      <button
        type="button"
        className="primary-btn"
        disabled={busy || !isChanged}
        onClick={() => onSave(task, { title, priority, assignee_id: assigneeId })}
      >
        {busy ? savingText : saveText}
      </button>
    </div>
  );
}

export function KanbanBoard({
  board,
  currentUserId,
  currentUserRole,
  onMoveTask,
  onUpdateTask,
  busyTaskId,
  title,
  noBoardText,
  noTasksText,
  moveToText,
  updateTaskText,
  assigneeText,
  unassignedText,
  saveText,
  savingText,
  noPermissionMoveDevText,
  noPermissionMovePoText,
  noPermissionEditText,
  statusLabels,
  priorityLabels,
  users,
}: Props) {
  if (!board) return <section className="panel">{noBoardText}</section>;

  return (
    <section className="panel">
      <h3 className="section-title">{title}</h3>
      <div className="kanban-grid">
        {COLUMNS.map((column) => (
          <div key={column} className="kanban-col">
            <h4>{statusLabels[column]}</h4>
            <ul className="task-list">
              {board.columns[column].map((task) => (
                <li
                  key={task.id}
                  className={`task-item ${
                    currentUserRole !== "LEAD" && busyTaskId !== task.id ? "task-item-readonly" : ""
                  }`}
                >
                  <p className="task-name">{task.title}</p>
                  <div className="meta-row">
                    <span className={`badge ${statusClass(task.status)}`}>{statusLabels[task.status]}</span>
                    <span className={`badge ${priorityClass(task.priority)}`}>{priorityLabels[task.priority]}</span>
                  </div>
                  {task.status !== "DONE" ? (
                    <div className="meta-row" style={{ marginTop: 8 }}>
                      {(() => {
                        const blockedByDevRole = currentUserRole === "DEV" && task.assignee_id !== currentUserId;
                        const blockedByPoRole = currentUserRole === "PO";
                        const disabled = busyTaskId === task.id || blockedByDevRole || blockedByPoRole;
                        const reason = blockedByDevRole ? noPermissionMoveDevText : blockedByPoRole ? noPermissionMovePoText : "";
                        return (
                          <button
                            type="button"
                            className="primary-btn"
                            data-testid={`move-task-${task.id}`}
                            onClick={() => onMoveTask(task)}
                            disabled={disabled}
                            title={reason}
                          >
                            {moveToText} {statusLabels[NEXT_STATUS[task.status]]}
                          </button>
                        );
                      })()}
                    </div>
                  ) : null}

                  {currentUserRole === "LEAD" ? (
                    <TaskEditRow
                      task={task}
                      users={users}
                      onSave={onUpdateTask}
                      busy={busyTaskId === task.id}
                      updateTaskText={updateTaskText}
                      assigneeText={assigneeText}
                      unassignedText={unassignedText}
                      saveText={saveText}
                      savingText={savingText}
                      priorityLabels={priorityLabels}
                    />
                  ) : (
                    <p className="task-hint" title={noPermissionEditText}>
                      {noPermissionEditText}
                    </p>
                  )}
                </li>
              ))}
              {board.columns[column].length === 0 ? <li className="empty">{noTasksText}</li> : null}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
