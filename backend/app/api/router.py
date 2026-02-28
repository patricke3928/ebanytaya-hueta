from fastapi import APIRouter

from app.api.routes import auth, board, core, projects, tasks, users


api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(board.router)
api_router.include_router(tasks.router)
api_router.include_router(users.router)
api_router.include_router(core.router)
