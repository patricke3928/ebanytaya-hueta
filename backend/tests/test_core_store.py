from datetime import datetime, timedelta, timezone

from app.core_collab.store import CoreSessionStore


def test_replace_updates_keeps_single_snapshot():
    store = CoreSessionStore()
    session = store.create(project_id=1, name="test")
    session_id = session["id"]

    store.update_content(session_id, "u1")
    store.update_content(session_id, "u2")
    replaced = store.replace_updates(session_id, "snapshot")

    assert replaced is not None
    assert replaced["y_updates"] == ["snapshot"]


def test_prune_stale_presence_removes_users():
    store = CoreSessionStore()
    session = store.create(project_id=1, name="test")
    session_id = session["id"]

    store.set_presence(session_id, "alice", {"anchor": 1, "head": 1})
    store.set_presence(session_id, "bob", {"anchor": 2, "head": 2})

    target = store._sessions[session_id]  # noqa: SLF001 - controlled unit test
    target.presence_seen_at["alice"] = (datetime.now(timezone.utc) - timedelta(seconds=200)).isoformat()
    target.presence_seen_at["bob"] = datetime.now(timezone.utc).isoformat()

    stale = store.prune_stale_presence(session_id, ttl_seconds=30)

    assert stale == ["alice"]
    state = store.get(session_id)
    assert state is not None
    assert "alice" not in state["presence"]
    assert "bob" in state["presence"]
