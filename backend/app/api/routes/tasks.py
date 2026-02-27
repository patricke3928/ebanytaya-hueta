from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import Task, User
from app.db.schemas import TaskCreate, TaskOut, TaskPatch
from app.db.session import get_db
from app.services.access import can_update_task
from app.ws.manager import ws_manager


router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=TaskOut)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "LEAD":
        raise HTTPException(status_code=403, detail="Forbidden")

    task = Task(
        project_id=payload.project_id,
        title=payload.title,
        status=payload.status,
        priority=payload.priority,
        assignee_id=payload.assignee_id,
        parent_task_id=payload.parent_task_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    ws_manager.broadcast_project(
        task.project_id,
        {
            "type": "task.created",
            "task": {
                "id": task.id,
                "project_id": task.project_id,
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "assignee_id": task.assignee_id,
                "parent_task_id": task.parent_task_id,
            },
        },
    )
    return task


@router.patch("/{task_id}", response_model=TaskOut)
def patch_task(
    task_id: int,
    payload: TaskPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    patch_data = payload.model_dump(exclude_unset=True)
    if not patch_data:
        return task

    if not can_update_task(current_user, task, patch_data):
        raise HTTPException(status_code=403, detail="Forbidden")

    for key, value in patch_data.items():
        setattr(task, key, value)

    db.commit()
    db.refresh(task)

    ws_manager.broadcast_project(
        task.project_id,
        {
            "type": "task.updated",
            "task": {
                "id": task.id,
                "project_id": task.project_id,
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "assignee_id": task.assignee_id,
                "parent_task_id": task.parent_task_id,
            },
        },
    )

    return task
