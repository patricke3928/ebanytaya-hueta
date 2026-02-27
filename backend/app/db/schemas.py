from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    role: Literal["LEAD", "DEV", "PO"]


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    lead_id: int


class TaskPatch(BaseModel):
    status: Literal["BACKLOG", "TODO", "DOING", "DONE"] | None = None
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] | None = None
    assignee_id: int | None = None
    title: str | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: str
    status: str
    priority: str
    assignee_id: int | None
    parent_task_id: int | None


class BoardOut(BaseModel):
    project_id: int
    columns: dict[str, list[dict[str, Any]]]
