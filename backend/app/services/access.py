from sqlalchemy.orm import Session

from app.db.models import Project, Task, User


def get_visible_projects(db: Session, user: User) -> list[Project]:
    if user.role in {"LEAD", "PO"}:
        return db.query(Project).all()

    return (
        db.query(Project)
        .join(Task, Task.project_id == Project.id)
        .filter(Task.assignee_id == user.id)
        .distinct()
        .all()
    )


def can_access_project(db: Session, user: User, project_id: int) -> bool:
    if user.role in {"LEAD", "PO"}:
        return db.query(Project.id).filter(Project.id == project_id).first() is not None

    return (
        db.query(Task.id)
        .filter(Task.project_id == project_id, Task.assignee_id == user.id)
        .first()
        is not None
    )


def can_update_task(user: User, task: Task, payload: dict) -> bool:
    if user.role == "LEAD":
        return True

    if user.role == "DEV":
        allowed_keys = {"status"}
        is_own_task = task.assignee_id == user.id
        return set(payload.keys()).issubset(allowed_keys) and is_own_task

    return False
