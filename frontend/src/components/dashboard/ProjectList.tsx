import type { Project } from "@/types/domain";

type Props = {
  projects: Project[];
  selectedProjectId: number | null;
  onSelect: (id: number) => void;
};

export function ProjectList({ projects, selectedProjectId, onSelect }: Props) {
  return (
    <aside>
      <h3>Projects</h3>
      <ul>
        {projects.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              onClick={() => onSelect(project.id)}
              style={{ fontWeight: selectedProjectId === project.id ? 700 : 400 }}
            >
              {project.name}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
