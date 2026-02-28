from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.db.models import User
from app.core_collab.store import core_session_store


router = APIRouter(prefix="/core", tags=["core"])


class CoreSessionCreate(BaseModel):
    project_id: int
    name: str


@router.get("/sessions")
def list_core_sessions(_: User = Depends(get_current_user)):
    return core_session_store.list()


@router.post("/sessions")
def create_core_session(payload: CoreSessionCreate, _: User = Depends(get_current_user)):
    return core_session_store.create(project_id=payload.project_id, name=payload.name)
