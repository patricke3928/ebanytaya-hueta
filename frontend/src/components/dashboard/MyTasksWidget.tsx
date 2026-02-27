import type { Task } from "@/types/domain";

type Props = {
  tasks: Task[];
};

export function MyTasksWidget({ tasks }: Props) {
  return (
    <section>
      <h3>My Tasks</h3>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            {task.title} [{task.status}] ({task.priority})
          </li>
        ))}
      </ul>
    </section>
  );
}
