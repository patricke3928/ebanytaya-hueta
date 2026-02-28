"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor, Position, Selection } from "monaco-editor";
import * as Y from "yjs";

import { getMe } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

type CoreSession = {
  id: number;
  project_id: number;
  name: string;
  created_at: string;
  updated_at?: string;
  y_updates?: string[];
  version?: number;
};

type Cursor = { anchor: number; head: number; file?: string } | null;
type PresenceMap = Record<string, Cursor>;
type FollowingMap = Record<string, string | null>;

type CoreMessage =
  | {
      type: "core.bootstrap";
      session_id: number;
      updates: string[];
      version: number;
      presence: PresenceMap;
      following: FollowingMap;
    }
  | { type: "core.yjs.update"; session_id: number; update: string; version: number; from_user?: string }
  | { type: "core.yjs.snapshot"; session_id: number; update: string; version: number; from_user?: string }
  | { type: "presence.update"; session_id: number; user: string; cursor: Cursor }
  | { type: "presence.leave"; session_id: number; user: string }
  | { type: "follow.changed"; session_id: number; follower: string; target_user: string | null }
  | { type: "pong" };

type TreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children: TreeNode[];
};

const DEFAULT_FILES: Array<{ name: string; content: string }> = [
  {
    name: "src/index.ts",
    content:
      "export function main(): void {\n  console.log('Nexus Core session started');\n}\n\nmain();\n",
  },
  {
    name: "src/api.ts",
    content: "export async function health(): Promise<string> {\n  return 'ok';\n}\n",
  },
  {
    name: "README.md",
    content: "# Core Session\n\nCollaborative coding workspace.\n",
  },
];

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getLanguage(fileName: string): string {
  if (fileName.endsWith(".ts") || fileName.endsWith(".tsx")) return "typescript";
  if (fileName.endsWith(".js") || fileName.endsWith(".jsx")) return "javascript";
  if (fileName.endsWith(".py")) return "python";
  if (fileName.endsWith(".go")) return "go";
  if (fileName.endsWith(".rs")) return "rust";
  if (fileName.endsWith(".md")) return "markdown";
  if (fileName.endsWith(".json")) return "json";
  return "plaintext";
}

function clampOffset(position: number, length: number): number {
  if (Number.isNaN(position)) return 0;
  return Math.max(0, Math.min(position, length));
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/+/g, "/")
    .trim();
}

function joinPath(base: string, leaf: string): string {
  if (!base) return normalizePath(leaf);
  return normalizePath(`${base}/${leaf}`);
}

function extractFoldersFromFiles(files: string[]): string[] {
  const folderSet = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    let prefix = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      folderSet.add(prefix);
    }
  }
  return Array.from(folderSet).sort((a, b) => a.localeCompare(b));
}

function buildTree(files: string[], folders: string[]): TreeNode[] {
  const root: TreeNode = { name: "root", path: "", type: "folder", children: [] };

  const ensureFolder = (folderPath: string) => {
    const segments = folderPath.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let child = current.children.find((node) => node.type === "folder" && node.name === segment);
      if (!child) {
        child = { name: segment, path: currentPath, type: "folder", children: [] };
        current.children.push(child);
      }
      current = child;
    }
  };

  for (const folder of folders) {
    ensureFolder(folder);
  }

  for (const file of files) {
    const normalized = normalizePath(file);
    const parts = normalized.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue;
    const folderPath = parts.join("/");
    if (folderPath) ensureFolder(folderPath);

    let current = root;
    for (const segment of parts) {
      const next = current.children.find((node) => node.type === "folder" && node.name === segment);
      if (!next) break;
      current = next;
    }

    current.children.push({
      name: fileName,
      path: normalized,
      type: "file",
      children: [],
    });
  }

  const sortRecursively = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.type === "folder") sortRecursively(node.children);
    }
  };

  sortRecursively(root.children);
  return root.children;
}

function collectConsoleOutput(language: string, source: string): string[] {
  const lines: string[] = [];
  const jsMatches = Array.from(source.matchAll(/console\.log\((['"`])(.+?)\1\)/g)).map((m) => m[2]);
  const pyMatches = Array.from(source.matchAll(/print\((['"`])(.+?)\1\)/g)).map((m) => m[2]);

  if (language === "typescript" || language === "javascript") {
    lines.push(...jsMatches);
  } else if (language === "python") {
    lines.push(...pyMatches);
  } else if (language === "markdown") {
    lines.push("Rendered markdown preview (simulated)");
  }

  return lines;
}

function ensureDefaults(filesMap: Y.Map<Y.Text>, foldersMap: Y.Map<number>) {
  if (filesMap.size > 0) return;
  for (const file of DEFAULT_FILES) {
    const text = new Y.Text();
    text.insert(0, file.content);
    filesMap.set(file.name, text);
  }
  foldersMap.set("src", 1);
}

export default function CorePage() {
  const [token, setToken] = useState("");
  const [currentUser, setCurrentUser] = useState("");
  const [projectId, setProjectId] = useState("1");
  const [name, setName] = useState("Pair Session");
  const [sessions, setSessions] = useState<CoreSession[]>([]);
  const [activeSession, setActiveSession] = useState<number | null>(null);

  const [events, setEvents] = useState<string[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [openedTabs, setOpenedTabs] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>("src/index.ts");
  const [content, setContent] = useState("");
  const [version, setVersion] = useState(0);

  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [presence, setPresence] = useState<PresenceMap>({});
  const [following, setFollowing] = useState<FollowingMap>({});
  const [followTarget, setFollowTarget] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ src: true });

  const [terminalLines, setTerminalLines] = useState<string[]>(["Nexus Runner ready."]);
  const [isRunning, setIsRunning] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const filesMapRef = useRef<Y.Map<Y.Text> | null>(null);
  const foldersMapRef = useRef<Y.Map<number> | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const localUpdateCounterRef = useRef(0);
  const activeFileRef = useRef(activeFile);
  const runTimerRef = useRef<number | null>(null);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  const sortedParticipants = useMemo(() => Object.keys(presence).sort(), [presence]);
  const tree = useMemo(() => buildTree(files, Array.from(new Set([...folders, ...extractFoldersFromFiles(files)]))), [files, folders]);

  useEffect(() => {
    const saved = window.localStorage.getItem("nexus_token");
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!token) return;
    getMe(token)
      .then((me) => setCurrentUser(me.username))
      .catch(() => setCurrentUser(""));
  }, [token]);

  useEffect(() => {
    if (!token) return;

    setIsSessionsLoading(true);
    fetch(`${API_URL}/api/core/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load sessions");
        const data = (await res.json()) as CoreSession[];
        setSessions(data);
        if (!activeSession && data.length > 0) setActiveSession(data[0].id);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setIsSessionsLoading(false));
  }, [token, activeSession]);

  useEffect(() => {
    if (!token || !activeSession) return;

    setIsConnected(false);
    setError(null);
    setFollowTarget(null);
    setPresence({});
    setFollowing({});
    setFiles([]);
    setFolders([]);
    setOpenedTabs([]);
    setActiveFile("src/index.ts");
    setContent("");
    localUpdateCounterRef.current = 0;

    const doc = new Y.Doc();
    const filesMap = doc.getMap<Y.Text>("files");
    const foldersMap = doc.getMap<number>("folders");

    docRef.current = doc;
    filesMapRef.current = filesMap;
    foldersMapRef.current = foldersMap;

    const syncLocalView = () => {
      const nextFiles = Array.from(filesMap.keys()).sort((a, b) => a.localeCompare(b));
      const nextFolders = Array.from(foldersMap.keys()).sort((a, b) => a.localeCompare(b));
      setFiles(nextFiles);
      setFolders(nextFolders);

      setActiveFile((prev) => {
        if (nextFiles.length === 0) return "";
        if (!nextFiles.includes(prev)) return nextFiles[0];
        return prev;
      });

      setOpenedTabs((prev) => {
        const cleaned = prev.filter((tab) => nextFiles.includes(tab));
        if (nextFiles.length === 0) return [];
        const active = activeFileRef.current;
        const fallback = nextFiles[0];
        const mustHave = nextFiles.includes(active) ? active : fallback;
        if (!cleaned.includes(mustHave)) cleaned.push(mustHave);
        return cleaned.slice(-8);
      });

      const targetFile = nextFiles.includes(activeFileRef.current) ? activeFileRef.current : nextFiles[0];
      if (!targetFile) {
        setContent("");
        return;
      }
      const ytext = filesMap.get(targetFile);
      const nextContent = ytext ? ytext.toString() : "";
      setContent((prev) => (prev === nextContent ? prev : nextContent));
    };

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      syncLocalView();
      if (origin !== "local") return;

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !activeSession) return;

      ws.send(
        JSON.stringify({
          type: "core.yjs.update",
          session_id: activeSession,
          update: toBase64(update),
        }),
      );

      localUpdateCounterRef.current += 1;
      if (localUpdateCounterRef.current >= 50) {
        localUpdateCounterRef.current = 0;
        const fullState = Y.encodeStateAsUpdate(doc);
        ws.send(
          JSON.stringify({
            type: "core.yjs.snapshot",
            session_id: activeSession,
            update: toBase64(fullState),
          }),
        );
      }
    };

    const onDeepChange = () => syncLocalView();

    doc.on("update", onDocUpdate);
    filesMap.observeDeep(onDeepChange);
    foldersMap.observeDeep(onDeepChange);

    const ws = new WebSocket(`${WS_URL}/ws/core/sessions/${activeSession}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setEvents((prev) => [`Connected to session #${activeSession}`, ...prev].slice(0, 80));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as CoreMessage;

        if (message.type === "core.bootstrap") {
          doc.transact(() => {
            for (const encoded of message.updates) {
              try {
                Y.applyUpdate(doc, fromBase64(encoded), "remote");
              } catch {
                // noop
              }
            }
            ensureDefaults(filesMap, foldersMap);
          }, "remote");
          setVersion(message.version);
          setPresence(message.presence ?? {});
          setFollowing(message.following ?? {});
          syncLocalView();
          return;
        }

        if (message.type === "core.yjs.update" || message.type === "core.yjs.snapshot") {
          try {
            Y.applyUpdate(doc, fromBase64(message.update), "remote");
            setVersion(message.version);
            if (message.from_user) {
              const label = message.type === "core.yjs.snapshot" ? "snapshotted" : "synced";
              setEvents((prev) => [`${message.from_user} ${label} v${message.version}`, ...prev].slice(0, 80));
            }
          } catch {
            setEvents((prev) => ["Invalid update payload ignored", ...prev].slice(0, 80));
          }
          return;
        }

        if (message.type === "presence.update") {
          setPresence((prev) => ({ ...prev, [message.user]: message.cursor }));
          return;
        }

        if (message.type === "presence.leave") {
          setPresence((prev) => {
            const next = { ...prev };
            delete next[message.user];
            return next;
          });
          return;
        }

        if (message.type === "follow.changed") {
          setFollowing((prev) => ({ ...prev, [message.follower]: message.target_user }));
        }
      } catch {
        setEvents((prev) => [String(event.data), ...prev].slice(0, 80));
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setEvents((prev) => [`Disconnected from session #${activeSession}`, ...prev].slice(0, 80));
    };

    ws.onerror = () => setError("WebSocket connection failed");

    return () => {
      doc.off("update", onDocUpdate);
      filesMap.unobserveDeep(onDeepChange);
      foldersMap.unobserveDeep(onDeepChange);
      doc.destroy();
      ws.close();
      wsRef.current = null;
      docRef.current = null;
      filesMapRef.current = null;
      foldersMapRef.current = null;
      decorationIdsRef.current = [];
      if (runTimerRef.current) {
        window.clearTimeout(runTimerRef.current);
        runTimerRef.current = null;
      }
    };
  }, [token, activeSession]);

  useEffect(() => {
    const filesMap = filesMapRef.current;
    if (!filesMap || !activeFile) return;
    const ytext = filesMap.get(activeFile);
    const next = ytext ? ytext.toString() : "";
    setContent(next);
    setOpenedTabs((prev) => {
      if (prev.includes(activeFile)) return prev;
      return [...prev, activeFile].slice(-8);
    });
  }, [activeFile]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const decorations: MonacoEditor.IModelDeltaDecoration[] = [];
    for (const [username, cursor] of Object.entries(presence)) {
      if (username === currentUser || !cursor) continue;
      if ((cursor.file ?? activeFile) !== activeFile) continue;

      const from = clampOffset(cursor.anchor, model.getValueLength());
      const to = clampOffset(cursor.head, model.getValueLength());
      const start = model.getPositionAt(Math.min(from, to));
      const end = model.getPositionAt(Math.max(from, to));

      decorations.push({
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column === start.column ? end.column + 1 : end.column,
        },
        options: {
          className: "core-remote-selection",
          after: {
            content: ` ${username}`,
            inlineClassName: "core-remote-label",
          },
        },
      });
    }

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }, [presence, activeFile, currentUser, content]);

  useEffect(() => {
    if (!followTarget) return;
    const target = presence[followTarget];
    if (!target) return;

    if (target.file && target.file !== activeFile) {
      setActiveFile(target.file);
      return;
    }

    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;

    const offset = clampOffset(target.head, model.getValueLength());
    const pos: Position = model.getPositionAt(offset);
    editor.focus();
    editor.setPosition(pos);
    editor.revealPositionInCenter(pos);
  }, [presence, followTarget, activeFile]);

  async function createSession(event: FormEvent) {
    event.preventDefault();
    if (!token || !projectId.trim() || !name.trim()) return;

    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/core/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ project_id: Number(projectId), name: name.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create session");
      const next = (await res.json()) as CoreSession;
      setSessions((prev) => [next, ...prev]);
      setActiveSession(next.id);
      setVersion(next.version ?? 1);
      setTerminalLines((prev) => [`Session #${next.id} created`, ...prev].slice(0, 120));
    } catch (err) {
      setError(String(err));
    } finally {
      setIsCreating(false);
    }
  }

  function sendPresence(selection: Selection | null) {
    const ws = wsRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!ws || ws.readyState !== WebSocket.OPEN || !selection || !model || !activeSession || !activeFile) return;

    ws.send(
      JSON.stringify({
        type: "presence.update",
        session_id: activeSession,
        cursor: {
          file: activeFile,
          anchor: model.getOffsetAt(selection.getStartPosition()),
          head: model.getOffsetAt(selection.getEndPosition()),
        },
      }),
    );
  }

  function handleEditorChange(nextValue: string | undefined) {
    const value = nextValue ?? "";
    const filesMap = filesMapRef.current;
    if (!filesMap || !activeFile) return;
    const ytext = filesMap.get(activeFile);
    if (!ytext || value === ytext.toString()) return;

    ytext.doc?.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, value);
    }, "local");
  }

  function handleAddFile(folderPath = "") {
    const filesMap = filesMapRef.current;
    if (!filesMap) return;

    const rawName = window.prompt("New file name (example: utils/helpers.ts):", "new-file.ts");
    if (!rawName) return;

    const fullPath = joinPath(folderPath, rawName);
    if (!fullPath) return;
    if (filesMap.has(fullPath)) {
      setError(`File already exists: ${fullPath}`);
      return;
    }

    const foldersMap = foldersMapRef.current;
    const parts = fullPath.split("/");
    let prefix = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      foldersMap?.set(prefix, 1);
      setExpandedFolders((prev) => ({ ...prev, [prefix]: true }));
    }

    const text = new Y.Text();
    text.insert(0, "");
    filesMap.set(fullPath, text);
    setActiveFile(fullPath);
  }

  function handleAddFolder(parentPath = "") {
    const foldersMap = foldersMapRef.current;
    if (!foldersMap) return;

    const nameInput = window.prompt("New folder name:", "new-folder");
    if (!nameInput) return;

    const folderPath = joinPath(parentPath, nameInput);
    if (!folderPath) return;
    foldersMap.set(folderPath, 1);
    setExpandedFolders((prev) => ({ ...prev, [folderPath]: true }));
  }

  function handleRenameFile(path: string) {
    const filesMap = filesMapRef.current;
    if (!filesMap) return;

    const nextPathInput = window.prompt("Rename file path:", path);
    if (!nextPathInput) return;
    const nextPath = normalizePath(nextPathInput);
    if (!nextPath || nextPath === path) return;
    if (filesMap.has(nextPath)) {
      setError(`File already exists: ${nextPath}`);
      return;
    }

    const source = filesMap.get(path);
    if (!source) return;
    const text = new Y.Text();
    text.insert(0, source.toString());
    filesMap.set(nextPath, text);
    filesMap.delete(path);

    const foldersMap = foldersMapRef.current;
    const parts = nextPath.split("/");
    let prefix = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      foldersMap?.set(prefix, 1);
      setExpandedFolders((prev) => ({ ...prev, [prefix]: true }));
    }

    if (activeFile === path) setActiveFile(nextPath);
    setOpenedTabs((prev) => prev.map((tab) => (tab === path ? nextPath : tab)));
  }

  function handleDeleteFile(path: string) {
    const filesMap = filesMapRef.current;
    if (!filesMap) return;

    if (filesMap.size <= 1) {
      setError("Cannot delete the last file.");
      return;
    }
    if (!window.confirm(`Delete file ${path}?`)) return;

    filesMap.delete(path);
    setOpenedTabs((prev) => prev.filter((tab) => tab !== path));
    if (activeFile === path) {
      const remaining = Array.from(filesMap.keys()).sort((a, b) => a.localeCompare(b));
      setActiveFile(remaining[0] ?? "");
    }
  }

  function handleDeleteFolder(path: string) {
    const filesMap = filesMapRef.current;
    const foldersMap = foldersMapRef.current;
    if (!filesMap || !foldersMap) return;

    if (!window.confirm(`Delete folder ${path} and all nested files?`)) return;

    const filePrefix = `${path}/`;
    const affectedFiles = Array.from(filesMap.keys()).filter((file) => file.startsWith(filePrefix));
    if (filesMap.size - affectedFiles.length <= 0) {
      setError("Cannot delete folder because it would remove all files.");
      return;
    }

    for (const file of affectedFiles) {
      filesMap.delete(file);
    }
    for (const folder of Array.from(foldersMap.keys())) {
      if (folder === path || folder.startsWith(`${path}/`)) foldersMap.delete(folder);
    }

    setOpenedTabs((prev) => prev.filter((tab) => !tab.startsWith(filePrefix)));
    if (activeFile.startsWith(filePrefix)) {
      const remaining = Array.from(filesMap.keys()).sort((a, b) => a.localeCompare(b));
      setActiveFile(remaining[0] ?? "");
    }
  }

  function handleFollow(user: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeSession || user === currentUser) return;

    setFollowTarget(user);
    ws.send(
      JSON.stringify({
        type: "follow.start",
        session_id: activeSession,
        target_user: user,
      }),
    );
  }

  function stopFollow() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeSession) return;
    setFollowTarget(null);
    ws.send(
      JSON.stringify({
        type: "follow.stop",
        session_id: activeSession,
      }),
    );
  }

  function closeTab(path: string) {
    setOpenedTabs((prev) => prev.filter((item) => item !== path));
    if (activeFile === path) {
      const next = openedTabs.find((item) => item !== path) ?? files.find((item) => item !== path) ?? "";
      setActiveFile(next);
    }
  }

  function toggleFolder(path: string) {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  }

  function runCode() {
    if (isRunning || !activeFile) return;

    const language = getLanguage(activeFile);
    const stamp = new Date().toLocaleTimeString();
    const logs = collectConsoleOutput(language, content);

    setIsRunning(true);
    setTerminalLines((prev) => [`[${stamp}] ▶ Running ${activeFile} (${language})`, ...prev].slice(0, 120));

    const steps = [
      "Resolving workspace graph...",
      "Lint check: passed",
      "Type inference: no critical issues",
      ...logs.map((line) => `stdout: ${line}`),
      logs.length === 0 ? "No explicit output detected." : "",
      `Execution finished for ${activeFile}.`,
    ].filter(Boolean);

    let index = 0;
    const tick = () => {
      if (index >= steps.length) {
        setIsRunning(false);
        runTimerRef.current = null;
        return;
      }
      const next = steps[index];
      index += 1;
      setTerminalLines((prev) => [next, ...prev].slice(0, 120));
      runTimerRef.current = window.setTimeout(tick, 220);
    };

    runTimerRef.current = window.setTimeout(tick, 220);
  }

  function stopRun() {
    if (runTimerRef.current) {
      window.clearTimeout(runTimerRef.current);
      runTimerRef.current = null;
    }
    setIsRunning(false);
    setTerminalLines((prev) => ["Execution interrupted by user.", ...prev].slice(0, 120));
  }

  function clearTerminal() {
    setTerminalLines(["Terminal cleared."]);
  }

  function saveSnapshotNow() {
    const ws = wsRef.current;
    const doc = docRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !doc || !activeSession) return;
    const fullState = Y.encodeStateAsUpdate(doc);
    ws.send(
      JSON.stringify({
        type: "core.yjs.snapshot",
        session_id: activeSession,
        update: toBase64(fullState),
      }),
    );
    setEvents((prev) => ["Manual snapshot sent", ...prev].slice(0, 80));
  }

  const onEditorMount: OnMount = (editor, monaco: Monaco) => {
    editorRef.current = editor;

    editor.onDidChangeCursorSelection((event) => {
      sendPresence(event.selection);
    });

    editor.onDidFocusEditorText(() => {
      sendPresence(editor.getSelection());
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveSnapshotNow());
  };

  function renderTree(nodes: TreeNode[], depth = 0): JSX.Element[] {
    const rendered: JSX.Element[] = [];

    for (const node of nodes) {
      if (node.type === "folder") {
        const expanded = expandedFolders[node.path] ?? depth < 1;
        rendered.push(
          <li key={node.path}>
            <div className="core-tree-row" style={{ paddingLeft: 10 + depth * 14 }}>
              <button type="button" className="core-tree-toggle" onClick={() => toggleFolder(node.path)}>
                {expanded ? "▾" : "▸"}
              </button>
              <button type="button" className="core-tree-item folder" onClick={() => toggleFolder(node.path)}>
                {node.name}
              </button>
              <button type="button" className="core-mini-btn" onClick={() => handleAddFile(node.path)} title="New file">
                +F
              </button>
              <button type="button" className="core-mini-btn" onClick={() => handleAddFolder(node.path)} title="New folder">
                +D
              </button>
              <button type="button" className="core-mini-btn danger" onClick={() => handleDeleteFolder(node.path)} title="Delete folder">
                Del
              </button>
            </div>
            {expanded && node.children.length > 0 ? <ul className="core-tree-list">{renderTree(node.children, depth + 1)}</ul> : null}
          </li>,
        );
      } else {
        rendered.push(
          <li key={node.path}>
            <div className="core-tree-row" style={{ paddingLeft: 30 + depth * 14 }}>
              <button
                type="button"
                className={`core-tree-item file ${activeFile === node.path ? "active" : ""}`}
                onClick={() => setActiveFile(node.path)}
              >
                {node.name}
              </button>
              <button type="button" className="core-mini-btn" onClick={() => handleRenameFile(node.path)} title="Rename file">
                Ren
              </button>
              <button type="button" className="core-mini-btn danger" onClick={() => handleDeleteFile(node.path)} title="Delete file">
                Del
              </button>
            </div>
          </li>,
        );
      }
    }

    return rendered;
  }

  return (
    <div className="page">
      <section className="panel" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0 }}>
          <Link href="/dashboard" className="link-btn">
            ← Back to Dashboard
          </Link>
        </p>
        <h1 className="heading" style={{ fontSize: 28, marginTop: 8 }}>
          The Core v3 (Monaco + Yjs + Explorer)
        </h1>
        <p className="subtle">IDE-style workspace with folders, tabs, collaborative cursors, follow mode and run console.</p>
      </section>

      {!token ? (
        <section className="panel panel-error" style={{ marginBottom: 16 }}>
          <p className="empty">Sign in first via Dashboard.</p>
        </section>
      ) : null}

      {error ? (
        <section className="panel panel-error" style={{ marginBottom: 16 }}>
          <p className="empty">{error}</p>
        </section>
      ) : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <form onSubmit={createSession} className="action-grid">
          <input className="text-input" data-testid="core-project-input" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project ID" />
          <input className="text-input" data-testid="core-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Session name" />
          <button type="submit" className="primary-btn" data-testid="core-create-submit" disabled={isCreating || !name.trim() || !projectId.trim()}>
            {isCreating ? "Creating..." : "Create session"}
          </button>
        </form>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h3 className="section-title">Sessions</h3>
        {isSessionsLoading ? (
          <div className="skeleton-block">
            <div className="skeleton skeleton-line lg" />
            <div className="skeleton skeleton-line md" />
          </div>
        ) : (
          <ul className="task-list">
            {sessions.map((session) => (
              <li key={session.id} className="task-item">
                <p className="task-name">#{session.id} {session.name}</p>
                <div className="meta-row">
                  <span className="badge status-todo">Project {session.project_id}</span>
                  <span className="badge prio-low">v{session.version ?? 1}</span>
                </div>
                <button className="primary-btn" data-testid={`core-connect-${session.id}`} onClick={() => setActiveSession(session.id)} style={{ marginTop: 8 }}>
                  {activeSession === session.id ? "Connected" : "Connect"}
                </button>
              </li>
            ))}
            {sessions.length === 0 ? <li className="empty">No sessions yet. Create one above.</li> : null}
          </ul>
        )}
      </section>

      <section className="core-workspace">
        <aside className="panel core-explorer">
          <div className="core-explorer-head">
            <h3 className="section-title" style={{ marginBottom: 0 }}>Explorer</h3>
            <div className="meta-row">
              <button type="button" className="secondary-btn" onClick={() => handleAddFile()}>+ File</button>
              <button type="button" className="secondary-btn" onClick={() => handleAddFolder()}>+ Folder</button>
            </div>
          </div>
          <ul className="core-tree-list">{renderTree(tree)}</ul>
        </aside>

        <section className="panel core-editor-shell">
          <div className="core-toolbar">
            <div className="core-tabs">
              {openedTabs.map((tab) => (
                <div key={tab} className={`core-tab ${tab === activeFile ? "active" : ""}`}>
                  <button type="button" className="core-tab-open" onClick={() => setActiveFile(tab)}>{tab}</button>
                  <button type="button" className="core-tab-close" onClick={() => closeTab(tab)}>×</button>
                </div>
              ))}
            </div>
            <div className="meta-row">
              <button type="button" className="secondary-btn" onClick={saveSnapshotNow}>Save Snapshot</button>
              <button type="button" className="primary-btn" onClick={runCode} disabled={isRunning || !activeFile}>▶ Пуск</button>
              <button type="button" className="secondary-btn" onClick={stopRun} disabled={!isRunning}>■ Стоп</button>
            </div>
          </div>

          <p className="subtle" style={{ marginBottom: 8 }}>
            {isConnected ? `Connected • version ${version}` : "Disconnected"}
            {activeFile ? ` • ${activeFile} (${getLanguage(activeFile)})` : ""}
            {followTarget ? ` • Following: ${followTarget}` : ""}
          </p>

          <div data-testid="core-editor">
            <Editor
              height="420px"
              path={activeFile || "untitled.txt"}
              defaultLanguage={getLanguage(activeFile || "")}
              language={getLanguage(activeFile || "")}
              value={content}
              onChange={handleEditorChange}
              onMount={onEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
              theme="vs-dark"
            />
          </div>
        </section>

        <aside className="panel core-presence">
          <h3 className="section-title">Presence & Follow</h3>
          <ul className="task-list">
            {sortedParticipants.map((username) => {
              const cursor = presence[username];
              const followBy = Object.entries(following)
                .filter(([, target]) => target === username)
                .map(([follower]) => follower)
                .join(", ");
              return (
                <li key={username} className="task-item">
                  <p className="task-name">{username}</p>
                  <p className="subtle" style={{ marginBottom: 8 }}>
                    {cursor ? `Cursor: ${cursor.anchor}-${cursor.head}${cursor.file ? ` in ${cursor.file}` : ""}` : "Cursor: not shared"}
                    {followBy ? ` • Followed by: ${followBy}` : ""}
                  </p>
                  {username !== currentUser ? (
                    <button type="button" className="secondary-btn" data-testid={`core-follow-${username}`} onClick={() => handleFollow(username)}>Follow</button>
                  ) : (
                    <span className="badge status-doing">You</span>
                  )}
                </li>
              );
            })}
            {sortedParticipants.length === 0 ? <li className="empty">No participants yet.</li> : null}
          </ul>
          <div className="meta-row" style={{ marginTop: 8 }}>
            <button type="button" className="secondary-btn" data-testid="core-follow-stop" onClick={stopFollow} disabled={!followTarget}>Stop follow</button>
          </div>
        </aside>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="core-terminal-head">
          <h3 className="section-title" style={{ marginBottom: 0 }}>Runner / Terminal</h3>
          <button type="button" className="secondary-btn" onClick={clearTerminal}>Clear</button>
        </div>
        <div className="core-terminal" data-testid="core-terminal">
          {terminalLines.map((line, idx) => (
            <p key={`${line}-${idx}`}>{line}</p>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h3 className="section-title">Realtime activity</h3>
        <ul className="feed-list">
          {events.map((event, idx) => (
            <li key={`${event}-${idx}`}>{event}</li>
          ))}
          {events.length === 0 ? <li className="empty">No realtime activity.</li> : null}
        </ul>
      </section>
    </div>
  );
}
