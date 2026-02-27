from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.models import Project, User
from app.db.schemas import ProjectCreate, ProjectOut
from app.db.session import get_db
from app.services.access import get_visible_projects


router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_visible_projects(db, current_user)


@router.post("", response_model=ProjectOut)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("LEAD")),
):
    project = Project(
        name=payload.name,
        description=payload.description,
        lead_id=current_user.id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project
