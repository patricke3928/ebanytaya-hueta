from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.core_collab.store import core_session_store
from app.db.models import User
from app.db.session import SessionLocal
from app.services.access import can_access_project
from app.ws.manager import ws_manager


router = APIRouter()
core_rooms: dict[int, set[WebSocket]] = {}
PRESENCE_TTL_SECONDS = 30


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


@router.websocket("/core/sessions/{session_id}")
async def core_session_ws(websocket: WebSocket, session_id: int):
    token = websocket.query_params.get("token")
    db = SessionLocal()
    user = _get_user_from_token(db, token)
    room: set[WebSocket] | None = None
    try:
        if not user:
            await websocket.close(code=1008)
            return

        session = core_session_store.get(session_id)
        if not session or not can_access_project(db, user, session["project_id"]):
            await websocket.close(code=1008)
            return

        await websocket.accept()
        room = core_rooms.setdefault(session_id, set())
        room.add(websocket)
        core_session_store.set_presence(session_id, user.username, None)

        for peer in list(room):
            try:
                await peer.send_json(
                    {
                        "type": "presence.update",
                        "session_id": session_id,
                        "user": user.username,
                        "cursor": None,
                    }
                )
            except Exception:
                room.discard(peer)

        stale = core_session_store.prune_stale_presence(session_id, PRESENCE_TTL_SECONDS)
        for stale_user in stale:
            for peer in list(room):
                try:
                    await peer.send_json(
                        {
                            "type": "presence.leave",
                            "session_id": session_id,
                            "user": stale_user,
                        }
                    )
                except Exception:
                    room.discard(peer)

        session = core_session_store.get(session_id)
        if not session:
            await websocket.close(code=1011)
            return

        await websocket.send_json(
            {
                "type": "core.bootstrap",
                "session_id": session_id,
                "updates": session["y_updates"],
                "version": session["version"],
                "presence": session["presence"],
                "following": session["following"],
            }
        )

        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if msg_type == "core.yjs.update":
                update = message.get("update")
                if not isinstance(update, str) or not update or len(update) > 200_000:
                    continue

                updated = core_session_store.update_content(session_id, update)
                if not updated:
                    continue

                payload = {
                    "type": "core.yjs.update",
                    "session_id": session_id,
                    "from_user": user.username,
                    "update": update,
                    "version": updated["version"],
                }
                for peer in list(room):
                    try:
                        await peer.send_json(payload)
                    except Exception:
                        room.discard(peer)

                stale = core_session_store.prune_stale_presence(session_id, PRESENCE_TTL_SECONDS)
                for stale_user in stale:
                    for peer in list(room):
                        try:
                            await peer.send_json(
                                {
                                    "type": "presence.leave",
                                    "session_id": session_id,
                                    "user": stale_user,
                                }
                            )
                        except Exception:
                            room.discard(peer)
                continue

            if msg_type == "core.yjs.snapshot":
                snapshot = message.get("update")
                if not isinstance(snapshot, str) or not snapshot or len(snapshot) > 600_000:
                    continue

                updated = core_session_store.replace_updates(session_id, snapshot)
                if not updated:
                    continue

                payload = {
                    "type": "core.yjs.snapshot",
                    "session_id": session_id,
                    "from_user": user.username,
                    "update": snapshot,
                    "version": updated["version"],
                }
                for peer in list(room):
                    try:
                        await peer.send_json(payload)
                    except Exception:
                        room.discard(peer)
                continue

            if msg_type == "presence.update":
                cursor = message.get("cursor")
                valid_cursor = None
                if isinstance(cursor, dict):
                    anchor = cursor.get("anchor")
                    head = cursor.get("head")
                    file_key = cursor.get("file")
                    if isinstance(anchor, int) and isinstance(head, int):
                        valid_cursor = {"anchor": anchor, "head": head}
                        if isinstance(file_key, str) and file_key:
                            valid_cursor["file"] = file_key

                core_session_store.set_presence(session_id, user.username, valid_cursor)
                payload = {
                    "type": "presence.update",
                    "session_id": session_id,
                    "user": user.username,
                    "cursor": valid_cursor,
                }
                for peer in list(room):
                    try:
                        await peer.send_json(payload)
                    except Exception:
                        room.discard(peer)
                continue

            if msg_type == "follow.start":
                target_user = message.get("target_user")
                if not isinstance(target_user, str) or target_user == user.username:
                    continue
                session_state = core_session_store.get(session_id)
                if not session_state:
                    continue
                if target_user not in session_state["presence"]:
                    continue
                core_session_store.set_follow(session_id, user.username, target_user)
                payload = {
                    "type": "follow.changed",
                    "session_id": session_id,
                    "follower": user.username,
                    "target_user": target_user,
                }
                for peer in list(room):
                    try:
                        await peer.send_json(payload)
                    except Exception:
                        room.discard(peer)
                continue

            if msg_type == "follow.stop":
                core_session_store.set_follow(session_id, user.username, None)
                payload = {
                    "type": "follow.changed",
                    "session_id": session_id,
                    "follower": user.username,
                    "target_user": None,
                }
                for peer in list(room):
                    try:
                        await peer.send_json(payload)
                    except Exception:
                        room.discard(peer)
    except WebSocketDisconnect:
        if room is not None:
            room.discard(websocket)
        if user is not None:
            core_session_store.clear_presence(session_id, user.username)
        if room is not None and user is not None:
            payload = {
                "type": "presence.leave",
                "session_id": session_id,
                "user": user.username,
            }
            for peer in list(room):
                try:
                    await peer.send_json(payload)
                except Exception:
                    room.discard(peer)
    finally:
        db.close()
