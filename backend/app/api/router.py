from fastapi import APIRouter

from app.api.routes import auth, board, projects, tasks


api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(board.router)
api_router.include_router(tasks.router)
