import type { Board } from "@/types/domain";

const COLUMNS = ["BACKLOG", "TODO", "DOING", "DONE"] as const;

type Props = {
  board: Board | null;
};

export function KanbanBoard({ board }: Props) {
  if (!board) return <section>No board selected</section>;

  return (
    <section>
      <h3>Kanban</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {COLUMNS.map((column) => (
          <div key={column} style={{ border: "1px solid #ddd", padding: 8 }}>
            <strong>{column}</strong>
            <ul>
              {board.columns[column].map((task) => (
                <li key={task.id}>
                  {task.title} ({task.priority})
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
