PRAGMA foreign_keys = ON;

BEGIN;

CREATE TABLE IF NOT EXISTS Users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('LEAD', 'DEV', 'PO'))
);

CREATE TABLE IF NOT EXISTS Projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    lead_id     INTEGER NOT NULL,
    FOREIGN KEY (lead_id) REFERENCES Users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Tasks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     INTEGER NOT NULL,
    title          TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('BACKLOG', 'TODO', 'DOING', 'DONE')),
    priority       TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    assignee_id    INTEGER,
    parent_task_id INTEGER,
    FOREIGN KEY (project_id) REFERENCES Projects(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES Users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    FOREIGN KEY (parent_task_id) REFERENCES Tasks(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Requirements (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id          INTEGER NOT NULL UNIQUE,
    content_markdown TEXT NOT NULL,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES Tasks(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id  ON Tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON Tasks(assignee_id);

COMMIT;
