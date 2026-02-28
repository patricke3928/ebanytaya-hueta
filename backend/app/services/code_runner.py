import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import TypedDict


MAX_TOTAL_BYTES = 350_000
MAX_FILE_BYTES = 120_000
MAX_FILES = 80
MAX_OUTPUT_BYTES = 24_000


class RunResult(TypedDict):
    ok: bool
    command: str
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int


def _truncate(text: str) -> str:
    if len(text.encode("utf-8")) <= MAX_OUTPUT_BYTES:
        return text
    return text[: MAX_OUTPUT_BYTES // 2] + "\n...[output truncated]..."


def _safe_rel_path(path: str) -> str | None:
    normalized = path.replace("\\", "/").strip().lstrip("/")
    if not normalized or normalized.endswith("/"):
        return None
    parts = [part for part in normalized.split("/") if part not in {"", "."}]
    if any(part == ".." for part in parts):
        return None
    return "/".join(parts)


def _run_subprocess(command: list[str], cwd: str, timeout: float) -> tuple[int, str, str]:
    completed = subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=max(1, int(timeout)),
    )
    return completed.returncode, completed.stdout, completed.stderr


def run_code(files: dict[str, str], entry_file: str, timeout_seconds: int = 8) -> RunResult:
    if not files:
        return {
            "ok": False,
            "command": "",
            "exit_code": 2,
            "stdout": "",
            "stderr": "No files to run.",
            "duration_ms": 0,
        }

    if len(files) > MAX_FILES:
        return {
            "ok": False,
            "command": "",
            "exit_code": 2,
            "stdout": "",
            "stderr": f"Too many files. Limit is {MAX_FILES}.",
            "duration_ms": 0,
        }

    safe_entry = _safe_rel_path(entry_file)
    if not safe_entry or safe_entry not in files:
        return {
            "ok": False,
            "command": "",
            "exit_code": 2,
            "stdout": "",
            "stderr": "Entry file is invalid or missing.",
            "duration_ms": 0,
        }

    total_bytes = sum(len(content.encode("utf-8")) for content in files.values())
    if total_bytes > MAX_TOTAL_BYTES:
        return {
            "ok": False,
            "command": "",
            "exit_code": 2,
            "stdout": "",
            "stderr": f"Workspace too large. Limit is {MAX_TOTAL_BYTES} bytes.",
            "duration_ms": 0,
        }

    start = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix="nexus-run-") as tmpdir:
        for raw_path, content in files.items():
            safe_path = _safe_rel_path(raw_path)
            if not safe_path:
                return {
                    "ok": False,
                    "command": "",
                    "exit_code": 2,
                    "stdout": "",
                    "stderr": f"Invalid path: {raw_path}",
                    "duration_ms": 0,
                }
            if len(content.encode("utf-8")) > MAX_FILE_BYTES:
                return {
                    "ok": False,
                    "command": "",
                    "exit_code": 2,
                    "stdout": "",
                    "stderr": f"File too large: {safe_path}",
                    "duration_ms": 0,
                }
            target = Path(tmpdir) / safe_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")

        entry_abs = str(Path(tmpdir) / safe_entry)
        ext = Path(safe_entry).suffix.lower()

        command: list[str]
        if ext == ".py":
            command = ["python3", entry_abs]
        elif ext in {".js", ".mjs", ".cjs"}:
            node = shutil.which("node")
            if not node:
                return {
                    "ok": False,
                    "command": "node",
                    "exit_code": 127,
                    "stdout": "",
                    "stderr": "Node.js is not installed on the server.",
                    "duration_ms": int((time.perf_counter() - start) * 1000),
                }
            command = [node, entry_abs]
        elif ext in {".ts", ".tsx"}:
            tsx = shutil.which("tsx")
            deno = shutil.which("deno")
            if tsx:
                command = [tsx, entry_abs]
            elif deno:
                command = [deno, "run", "--quiet", entry_abs]
            else:
                return {
                    "ok": False,
                    "command": "tsx|deno",
                    "exit_code": 127,
                    "stdout": "",
                    "stderr": "TypeScript runtime is not installed (need tsx or deno).",
                    "duration_ms": int((time.perf_counter() - start) * 1000),
                }
        elif ext == ".go":
            go = shutil.which("go")
            if not go:
                return {
                    "ok": False,
                    "command": "go",
                    "exit_code": 127,
                    "stdout": "",
                    "stderr": "Go is not installed on the server.",
                    "duration_ms": int((time.perf_counter() - start) * 1000),
                }
            command = [go, "run", entry_abs]
        elif ext == ".rs":
            rustc = shutil.which("rustc")
            if not rustc:
                return {
                    "ok": False,
                    "command": "rustc",
                    "exit_code": 127,
                    "stdout": "",
                    "stderr": "Rust is not installed on the server.",
                    "duration_ms": int((time.perf_counter() - start) * 1000),
                }
            binary_path = str(Path(tmpdir) / "run_bin")
            remaining = timeout_seconds
            compile_code, compile_out, compile_err = _run_subprocess(
                [rustc, entry_abs, "-O", "-o", binary_path], tmpdir, remaining
            )
            if compile_code != 0:
                return {
                    "ok": False,
                    "command": f"{rustc} {entry_abs} -O -o {binary_path}",
                    "exit_code": compile_code,
                    "stdout": _truncate(compile_out),
                    "stderr": _truncate(compile_err),
                    "duration_ms": int((time.perf_counter() - start) * 1000),
                }
            command = [binary_path]
        else:
            return {
                "ok": False,
                "command": "",
                "exit_code": 2,
                "stdout": "",
                "stderr": f"Unsupported file type: {ext or 'no extension'}",
                "duration_ms": int((time.perf_counter() - start) * 1000),
            }

        try:
            code, out, err = _run_subprocess(command, tmpdir, timeout_seconds)
            duration_ms = int((time.perf_counter() - start) * 1000)
            return {
                "ok": code == 0,
                "command": " ".join(command),
                "exit_code": code,
                "stdout": _truncate(out),
                "stderr": _truncate(err),
                "duration_ms": duration_ms,
            }
        except subprocess.TimeoutExpired:
            return {
                "ok": False,
                "command": " ".join(command),
                "exit_code": 124,
                "stdout": "",
                "stderr": f"Execution timed out after {timeout_seconds} seconds.",
                "duration_ms": int((time.perf_counter() - start) * 1000),
            }
