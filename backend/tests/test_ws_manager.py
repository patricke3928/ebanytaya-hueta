import asyncio

from app.ws.manager import WSManager


class DummyWS:
    async def send_json(self, payload: dict) -> None:  # pragma: no cover
        _ = payload


def test_broadcast_uses_create_task_when_event_loop_exists(monkeypatch):
    manager = WSManager()
    ws = DummyWS()
    manager.rooms[1].add(ws)  # type: ignore[arg-type]

    created: list[object] = []

    def fake_create_task(coro):
        created.append(coro)
        return object()

    monkeypatch.setattr(asyncio, "get_running_loop", lambda: object())
    monkeypatch.setattr(asyncio, "create_task", fake_create_task)

    manager.broadcast_project(1, {"type": "task.updated"})

    assert len(created) == 1
    created[0].close()


def test_broadcast_falls_back_to_from_thread_without_event_loop(monkeypatch):
    manager = WSManager()
    ws = DummyWS()
    manager.rooms[1].add(ws)  # type: ignore[arg-type]

    called: list[tuple[int, dict]] = []

    def fake_get_running_loop():
        raise RuntimeError("no running event loop")

    def fake_from_thread_run(fn, project_id, websocket, payload):
        _ = fn, websocket
        called.append((project_id, payload))

    monkeypatch.setattr(asyncio, "get_running_loop", fake_get_running_loop)
    monkeypatch.setattr("app.ws.manager.anyio.from_thread.run", fake_from_thread_run)

    manager.broadcast_project(1, {"type": "task.created"})

    assert called == [(1, {"type": "task.created"})]
