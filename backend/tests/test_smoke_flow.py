from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.deps import get_db
from app.db.models import Base, User
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
    lead = User(username="lead", email="lead@nexus.local", password_hash="topsecret", role="LEAD")
    db.add(lead)
    db.commit()
    db.close()

    return client


def test_smoke_end_to_end_task_flow():
    client = make_client()

    login_res = client.post("/api/auth/login", json={"username": "lead", "password": "topsecret"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["role"] == "LEAD"

    project_res = client.post("/api/projects", headers=headers, json={"name": "Smoke Project"})
    assert project_res.status_code == 200
    project_id = project_res.json()["id"]

    task_res = client.post(
        "/api/tasks",
        headers=headers,
        json={"project_id": project_id, "title": "Smoke Task", "status": "TODO", "priority": "HIGH"},
    )
    assert task_res.status_code == 200
    task_id = task_res.json()["id"]

    board_before = client.get(f"/api/projects/{project_id}/board", headers=headers)
    assert board_before.status_code == 200
    assert any(item["id"] == task_id for item in board_before.json()["columns"]["TODO"])

    patch_res = client.patch(f"/api/tasks/{task_id}", headers=headers, json={"status": "DONE"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "DONE"

    board_after = client.get(f"/api/projects/{project_id}/board", headers=headers)
    assert board_after.status_code == 200
    assert any(item["id"] == task_id for item in board_after.json()["columns"]["DONE"])
