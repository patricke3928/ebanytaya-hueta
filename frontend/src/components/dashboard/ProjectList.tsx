import type { Project } from "@/types/domain";

type Props = {
  projects: Project[];
  selectedProjectId: number | null;
  onSelect: (id: number) => void;
  title: string;
};

export function ProjectList({ projects, selectedProjectId, onSelect, title }: Props) {
  return (
    <aside className="panel">
      <h3 className="section-title">{title}</h3>
      <ul className="project-list">
        {projects.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              onClick={() => onSelect(project.id)}
              className={`project-button ${selectedProjectId === project.id ? "active" : ""}`}
            >
              {project.name}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
