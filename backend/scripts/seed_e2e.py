import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "nexus_os.db"


def upsert_user(cur: sqlite3.Cursor, username: str, email: str, password_hash: str, role: str) -> int:
    cur.execute(
        """
        INSERT INTO Users (username, email, password_hash, role)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
          email = excluded.email,
          password_hash = excluded.password_hash,
          role = excluded.role
        """,
        (username, email, password_hash, role),
    )
    cur.execute("SELECT id FROM Users WHERE username = ?", (username,))
    row = cur.fetchone()
    if not row:
        raise RuntimeError(f"Failed to upsert user: {username}")
    return int(row[0])


def ensure_task(cur: sqlite3.Cursor, project_id: int, title: str, assignee_id: int, status: str = "TODO") -> None:
    cur.execute(
        "SELECT id FROM Tasks WHERE project_id = ? AND title = ? LIMIT 1",
        (project_id, title),
    )
    row = cur.fetchone()
    if row:
        cur.execute(
            "UPDATE Tasks SET assignee_id = ?, status = ? WHERE id = ?",
            (assignee_id, status, int(row[0])),
        )
        return

    cur.execute(
        """
        INSERT INTO Tasks (project_id, title, status, priority, assignee_id, parent_task_id)
        VALUES (?, ?, ?, 'MEDIUM', ?, NULL)
        """,
        (project_id, title, status, assignee_id),
    )


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    cur = conn.cursor()

    lead_id = upsert_user(cur, "teamlead_anna", "anna@nexus.local", "hashed_password_example", "LEAD")
    dev_id = upsert_user(cur, "dev_e2e", "dev_e2e@nexus.local", "dev_password", "DEV")
    upsert_user(cur, "po_e2e", "po_e2e@nexus.local", "po_password", "PO")

    cur.execute("SELECT id FROM Projects WHERE name = ? LIMIT 1", ("E2E Access Project",))
    row = cur.fetchone()
    if row:
        project_id = int(row[0])
        cur.execute("UPDATE Projects SET lead_id = ? WHERE id = ?", (lead_id, project_id))
    else:
        cur.execute(
            """
            INSERT INTO Projects (name, description, lead_id)
            VALUES (?, ?, ?)
            """,
            ("E2E Access Project", "Seeded project for Playwright smoke tests", lead_id),
        )
        project_id = int(cur.lastrowid)

    ensure_task(cur, project_id, "E2E task assigned to DEV", dev_id)
    ensure_task(cur, project_id, "E2E task assigned to LEAD", lead_id)

    conn.commit()
    conn.close()
    print(f"E2E seed complete: {DB_PATH}")


if __name__ == "__main__":
    main()
