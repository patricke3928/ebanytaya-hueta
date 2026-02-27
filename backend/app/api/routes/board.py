from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import Task, User
from app.db.schemas import BoardOut
from app.db.session import get_db
from app.services.access import can_access_project


router = APIRouter(prefix="/projects", tags=["board"])


@router.get("/{project_id}/board", response_model=BoardOut)
def get_board(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not can_access_project(db, current_user, project_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    columns = {"BACKLOG": [], "TODO": [], "DOING": [], "DONE": []}

    for task in tasks:
        columns[task.status].append(
            {
                "id": task.id,
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "assignee_id": task.assignee_id,
                "parent_task_id": task.parent_task_id,
            }
        )

    return BoardOut(project_id=project_id, columns=columns)
