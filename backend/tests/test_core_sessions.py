from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.deps import get_db
from app.core_collab.store import core_session_store
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
    core_session_store.reset()

    db = TestingSessionLocal()
    user = User(username="lead", email="lead@nexus.local", password_hash="topsecret", role="LEAD")
    db.add(user)
    db.commit()
    db.close()

    return client


def test_core_session_create_list_and_get():
    client = make_client()
    login_res = client.post("/api/auth/login", json={"username": "lead", "password": "topsecret"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    project_res = client.post("/api/projects", headers=headers, json={"name": "Core Project"})
    assert project_res.status_code == 200
    project_id = project_res.json()["id"]

    create_res = client.post("/api/core/sessions", headers=headers, json={"project_id": project_id, "name": "Pair"})
    assert create_res.status_code == 200
    session = create_res.json()
    assert session["project_id"] == project_id
    assert session["y_updates"] == []
    assert session["version"] == 1

    list_res = client.get("/api/core/sessions", headers=headers)
    assert list_res.status_code == 200
    assert any(item["id"] == session["id"] for item in list_res.json())

    get_res = client.get(f"/api/core/sessions/{session['id']}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["id"] == session["id"]
