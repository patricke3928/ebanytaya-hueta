import asyncio
from collections import defaultdict

from fastapi import WebSocket


class WSManager:
    def __init__(self) -> None:
        self.rooms: dict[int, set[WebSocket]] = defaultdict(set)

    async def join(self, project_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.rooms[project_id].add(websocket)

    def leave(self, project_id: int, websocket: WebSocket) -> None:
        if project_id in self.rooms and websocket in self.rooms[project_id]:
            self.rooms[project_id].remove(websocket)

    def broadcast_project(self, project_id: int, payload: dict) -> None:
        for ws in list(self.rooms.get(project_id, set())):
            asyncio.create_task(self._safe_send(project_id, ws, payload))

    async def _safe_send(self, project_id: int, websocket: WebSocket, payload: dict) -> None:
        try:
            await websocket.send_json(payload)
        except Exception:
            self.leave(project_id, websocket)


ws_manager = WSManager()
