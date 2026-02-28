from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.deps import get_db
from app.core.security import create_access_token
from app.db.models import Base, Project, Task, User
from app.main import app


def make_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    db = TestingSessionLocal()
    lead = User(username="lead", email="lead@test.local", password_hash="pw", role="LEAD")
    dev = User(username="dev", email="dev@test.local", password_hash="pw", role="DEV")
    po = User(username="po", email="po@test.local", password_hash="pw", role="PO")
    db.add_all([lead, dev, po])
    db.commit()
    db.refresh(lead)
    db.refresh(dev)
    db.refresh(po)

    project = Project(name="Test Project", description="x", lead_id=lead.id)
    db.add(project)
    db.commit()
    db.refresh(project)

    own_task = Task(project_id=project.id, title="Own", status="TODO", priority="MEDIUM", assignee_id=dev.id)
    other_task = Task(project_id=project.id, title="Other", status="TODO", priority="MEDIUM", assignee_id=lead.id)
    db.add_all([own_task, other_task])
    db.commit()
    db.refresh(own_task)
    db.refresh(other_task)

    db.close()

    return client, {
        "lead_id": lead.id,
        "dev_id": dev.id,
        "po_id": po.id,
        "project_id": project.id,
        "own_task_id": own_task.id,
        "other_task_id": other_task.id,
    }


def auth_headers(username: str):
    token = create_access_token(subject=username)
    return {"Authorization": f"Bearer {token}"}


def test_only_lead_can_create_project():
    client, _ = make_client()

    lead_response = client.post("/api/projects", headers=auth_headers("lead"), json={"name": "P2"})
    assert lead_response.status_code == 200

    dev_response = client.post("/api/projects", headers=auth_headers("dev"), json={"name": "P3"})
    assert dev_response.status_code == 403


def test_only_lead_can_create_task():
    client, seeded = make_client()

    lead_response = client.post(
        "/api/tasks",
        headers=auth_headers("lead"),
        json={"project_id": seeded["project_id"], "title": "New", "status": "TODO", "priority": "LOW"},
    )
    assert lead_response.status_code == 200

    dev_response = client.post(
        "/api/tasks",
        headers=auth_headers("dev"),
        json={"project_id": seeded["project_id"], "title": "Nope"},
    )
    assert dev_response.status_code == 403


def test_dev_can_change_only_own_status():
    client, seeded = make_client()

    update_own_status = client.patch(
        f"/api/tasks/{seeded['own_task_id']}",
        headers=auth_headers("dev"),
        json={"status": "DOING"},
    )
    assert update_own_status.status_code == 200
    assert update_own_status.json()["status"] == "DOING"

    update_own_priority = client.patch(
        f"/api/tasks/{seeded['own_task_id']}",
        headers=auth_headers("dev"),
        json={"priority": "HIGH"},
    )
    assert update_own_priority.status_code == 403

    update_other_status = client.patch(
        f"/api/tasks/{seeded['other_task_id']}",
        headers=auth_headers("dev"),
        json={"status": "DOING"},
    )
    assert update_other_status.status_code == 403


def test_po_cannot_patch_tasks():
    client, seeded = make_client()

    response = client.patch(
        f"/api/tasks/{seeded['own_task_id']}",
        headers=auth_headers("po"),
        json={"status": "DONE"},
    )
    assert response.status_code == 403
