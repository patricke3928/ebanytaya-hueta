from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base, relationship


Base = declarative_base()


class User(Base):
    __tablename__ = "Users"

    id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False, unique=True)
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)

    __table_args__ = (
        CheckConstraint("role IN ('LEAD', 'DEV', 'PO')", name="ck_users_role"),
    )


class Project(Base):
    __tablename__ = "Projects"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    lead_id = Column(Integer, ForeignKey("Users.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False)

    lead = relationship("User")
    tasks = relationship("Task", back_populates="project")


class Task(Base):
    __tablename__ = "Tasks"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("Projects.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    status = Column(String, nullable=False)
    priority = Column(String, nullable=False)
    assignee_id = Column(Integer, ForeignKey("Users.id", onupdate="CASCADE", ondelete="SET NULL"))
    parent_task_id = Column(Integer, ForeignKey("Tasks.id", onupdate="CASCADE", ondelete="SET NULL"))

    __table_args__ = (
        CheckConstraint("status IN ('BACKLOG', 'TODO', 'DOING', 'DONE')", name="ck_tasks_status"),
        CheckConstraint("priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')", name="ck_tasks_priority"),
    )

    project = relationship("Project", back_populates="tasks")
    assignee = relationship("User")
    parent = relationship("Task", remote_side=[id])
    requirement = relationship("Requirement", back_populates="task", uselist=False)


class Requirement(Base):
    __tablename__ = "Requirements"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("Tasks.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False, unique=True)
    content_markdown = Column(Text, nullable=False)
    updated_at = Column(String, nullable=False)

    task = relationship("Task", back_populates="requirement")
