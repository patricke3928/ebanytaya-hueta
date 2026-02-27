import type { Board, Task } from "@/types/domain";

const COLUMNS = ["BACKLOG", "TODO", "DOING", "DONE"] as const;

type Props = {
  board: Board | null;
  currentUserId: number | null;
  currentUserRole: "LEAD" | "DEV" | "PO" | null;
  onMoveTask: (task: Task) => void;
  busyTaskId: number | null;
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

export function KanbanBoard({ board, currentUserId, currentUserRole, onMoveTask, busyTaskId }: Props) {
  if (!board) return <section className="panel">No board selected.</section>;

  return (
    <section className="panel">
      <h3 className="section-title">Kanban Board</h3>
      <div className="kanban-grid">
        {COLUMNS.map((column) => (
          <div key={column} className="kanban-col">
            <h4>{column}</h4>
            <ul className="task-list">
              {board.columns[column].map((task) => (
                <li key={task.id} className="task-item">
                  <p className="task-name">{task.title}</p>
                  <div className="meta-row">
                    <span className={`badge ${statusClass(task.status)}`}>{task.status}</span>
                    <span className={`badge ${priorityClass(task.priority)}`}>{task.priority}</span>
                  </div>
                  {task.status !== "DONE" ? (
                    <div className="meta-row" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => onMoveTask(task)}
                        disabled={
                          busyTaskId === task.id ||
                          (currentUserRole === "DEV" && task.assignee_id !== currentUserId) ||
                          currentUserRole === "PO"
                        }
                      >
                        Move to {NEXT_STATUS[task.status]}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
              {board.columns[column].length === 0 ? <li className="empty">No tasks.</li> : null}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
