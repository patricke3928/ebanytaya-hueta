# Nexus OS MVP

MVP ecosystem for project/task management with roles, Kanban board, and real-time updates.

## Stack
- Backend: FastAPI + SQLite (`nexus_os.db`)
- Frontend: Next.js
- Realtime: WebSocket (`/ws/projects/{project_id}`)

## Project Layout
- `backend/` FastAPI service
- `frontend/` Next.js app
- `nexus_os.db` existing SQLite database
- `schema.sql` schema script

## Run Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Run Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables (Frontend)
- `NEXT_PUBLIC_API_URL=http://localhost:8000`
- `NEXT_PUBLIC_WS_URL=ws://localhost:8000`

## Demo Login
The dashboard uses a bootstrap login hardcoded for quick start:
- username: `teamlead_anna`
- password: `hashed_password_example`

For production, remove demo login from UI and use real auth flow.
