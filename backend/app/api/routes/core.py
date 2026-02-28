from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.services.access import can_access_project
from app.core_collab.store import core_session_store


router = APIRouter(prefix="/core", tags=["core"])


class CoreSessionCreate(BaseModel):
    project_id: int
    name: str


@router.get("/sessions")
def list_core_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [item for item in core_session_store.list() if can_access_project(db, current_user, item["project_id"])]


@router.get("/sessions/{session_id}")
def get_core_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = core_session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Core session not found")
    if not can_access_project(db, current_user, session["project_id"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    return session


@router.post("/sessions")
def create_core_session(
    payload: CoreSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not can_access_project(db, current_user, payload.project_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return core_session_store.create(project_id=payload.project_id, name=payload.name)
