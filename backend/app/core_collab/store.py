from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone


@dataclass
class CoreSession:
    id: int
    project_id: int
    name: str
    created_at: str
    updated_at: str
    y_updates: list[str]
    version: int
    presence: dict[str, dict[str, int | str] | None]
    following: dict[str, str | None]
    presence_seen_at: dict[str, str]


class CoreSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[int, CoreSession] = {}
        self._next_id = 1

    def create(self, project_id: int, name: str) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        session = CoreSession(
            id=self._next_id,
            project_id=project_id,
            name=name,
            created_at=now,
            updated_at=now,
            y_updates=[],
            version=1,
            presence={},
            following={},
            presence_seen_at={},
        )
        self._sessions[session.id] = session
        self._next_id += 1
        return asdict(session)

    def list(self) -> list[dict]:
        return [asdict(item) for item in self._sessions.values()]

    def get(self, session_id: int) -> dict | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        return asdict(session)

    def update_content(self, session_id: int, content: str) -> dict | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        session.y_updates.append(content)
        session.version += 1
        session.updated_at = datetime.now(timezone.utc).isoformat()
        return asdict(session)

    def replace_updates(self, session_id: int, snapshot_update: str) -> dict | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        session.y_updates = [snapshot_update]
        session.version += 1
        session.updated_at = datetime.now(timezone.utc).isoformat()
        return asdict(session)

    def set_presence(self, session_id: int, username: str, cursor: dict[str, int | str] | None) -> dict | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        session.presence[username] = cursor
        session.presence_seen_at[username] = datetime.now(timezone.utc).isoformat()
        session.updated_at = datetime.now(timezone.utc).isoformat()
        return asdict(session)

    def clear_presence(self, session_id: int, username: str) -> dict | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        session.presence.pop(username, None)
        session.presence_seen_at.pop(username, None)
        session.following.pop(username, None)
        for follower, target in list(session.following.items()):
            if target == username:
                session.following[follower] = None
        session.updated_at = datetime.now(timezone.utc).isoformat()
        return asdict(session)

    def set_follow(self, session_id: int, follower: str, target_user: str | None) -> dict | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        session.following[follower] = target_user
        session.updated_at = datetime.now(timezone.utc).isoformat()
        return asdict(session)

    def prune_stale_presence(self, session_id: int, ttl_seconds: int) -> list[str]:
        session = self._sessions.get(session_id)
        if not session:
            return []
        now = datetime.now(timezone.utc)
        stale: list[str] = []
        for username, seen_at_raw in list(session.presence_seen_at.items()):
            try:
                seen_at = datetime.fromisoformat(seen_at_raw)
            except ValueError:
                stale.append(username)
                continue
            if now - seen_at > timedelta(seconds=ttl_seconds):
                stale.append(username)

        for username in stale:
            self.clear_presence(session_id, username)
        return stale

    def reset(self) -> None:
        self._sessions = {}
        self._next_id = 1


core_session_store = CoreSessionStore()
