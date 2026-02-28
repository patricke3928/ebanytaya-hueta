from dataclasses import asdict, dataclass
from datetime import datetime, timezone


@dataclass
class CoreSession:
    id: int
    project_id: int
    name: str
    created_at: str


class CoreSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[int, CoreSession] = {}
        self._next_id = 1

    def create(self, project_id: int, name: str) -> dict:
        session = CoreSession(
            id=self._next_id,
            project_id=project_id,
            name=name,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self._sessions[session.id] = session
        self._next_id += 1
        return asdict(session)

    def list(self) -> list[dict]:
        return [asdict(item) for item in self._sessions.values()]


core_session_store = CoreSessionStore()
