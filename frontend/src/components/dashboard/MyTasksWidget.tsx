import type { Task } from "@/types/domain";

type Props = {
  tasks: Task[];
  title: string;
  emptyText: string;
  statusLabels: Record<Task["status"], string>;
  priorityLabels: Record<Task["priority"], string>;
};

function statusClass(status: Task["status"]) {
  return `status-${status.toLowerCase()}`;
}

function priorityClass(priority: Task["priority"]) {
  return `prio-${priority.toLowerCase()}`;
}

export function MyTasksWidget({ tasks, title, emptyText, statusLabels, priorityLabels }: Props) {
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <h3 className="section-title">{title}</h3>
      <ul className="task-list">
        {tasks.map((task) => (
          <li key={task.id} className="task-item">
            <p className="task-name">{task.title}</p>
            <div className="meta-row">
              <span className={`badge ${statusClass(task.status)}`}>{statusLabels[task.status]}</span>
              <span className={`badge ${priorityClass(task.priority)}`}>{priorityLabels[task.priority]}</span>
            </div>
          </li>
        ))}
        {tasks.length === 0 ? <li className="empty">{emptyText}</li> : null}
      </ul>
    </section>
  );
}
