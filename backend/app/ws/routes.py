from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.models import User
from app.db.session import SessionLocal
from app.services.access import can_access_project
from app.ws.manager import ws_manager


router = APIRouter()


def _get_user_from_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    username = decode_token(token)
    if not username:
        return None
    return db.query(User).filter(User.username == username).first()


@router.websocket("/projects/{project_id}")
async def project_ws(websocket: WebSocket, project_id: int):
    token = websocket.query_params.get("token")
    db = SessionLocal()

    try:
        user = _get_user_from_token(db, token)
        if not user or not can_access_project(db, user, project_id):
            await websocket.close(code=1008)
            return

        await ws_manager.join(project_id, websocket)

        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        ws_manager.leave(project_id, websocket)
    finally:
        db.close()
