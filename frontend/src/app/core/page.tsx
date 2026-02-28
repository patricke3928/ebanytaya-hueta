"use client";

import Link from "next/link";
import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";

import { getMe } from "@/lib/api";
import { EditorShell } from "@/components/EditorShell";
import { NexusEditor, type NexusEditorFile } from "@/components/NexusEditor";

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

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  kind: "root" | "file" | "folder";
  path: string;
};

type DialogMode = "none" | "new-file" | "new-folder" | "rename-file" | "delete-file" | "delete-folder";

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

function toNexusLanguage(fileName: string): NexusEditorFile["language"] {
  const language = getLanguage(fileName);
  if (language === "python") return "python";
  if (language === "javascript") return "javascript";
  if (language === "typescript") return "typescript";
  return "plaintext";
}

function cursorColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 82% 62%)`;
}

function isRunnableFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith(".py") ||
    lower.endsWith(".js") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs") ||
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".go") ||
    lower.endsWith(".rs")
  );
}

function pickDefaultRunTarget(runnable: string[], active: string): string {
  if (runnable.length === 0) return "";
  const sorted = [...runnable].sort((a, b) => a.localeCompare(b));
  const mainCandidate =
    sorted.find((file) => {
      const base = file.split("/").pop()?.toLowerCase() ?? "";
      return base.startsWith("main.");
    }) ?? "";
  if (mainCandidate) return mainCandidate;
  if (active && sorted.includes(active)) return active;
  return sorted[0];
}

type ParsedDiagnostic = {
  file: string;
  line: number;
  column: number;
  message: string;
};

function normalizeDiagnosticPath(rawPath: string): string {
  return rawPath.replace(/^file:\/\//, "").replace(/\\/g, "/").trim();
}

function resolveDiagnosticFile(rawPath: string, workspaceFiles: string[]): string | null {
  const normalizedRaw = normalizeDiagnosticPath(rawPath);
  const normalizedWorkspace = workspaceFiles.map((file) => normalizePath(file));

  const direct = normalizedWorkspace.find((file) => file === normalizePath(normalizedRaw));
  if (direct) return direct;

  const suffix = normalizedWorkspace.find((file) => normalizedRaw.endsWith(`/${file}`) || normalizedRaw.endsWith(file));
  if (suffix) return suffix;

  const base = normalizedRaw.split("/").pop();
  if (!base) return null;
  const baseMatches = normalizedWorkspace.filter((file) => file.split("/").pop() === base);
  if (baseMatches.length === 1) return baseMatches[0];
  return null;
}

function parseRunDiagnostics(output: string, workspaceFiles: string[]): ParsedDiagnostic[] {
  const lines = output.split("\n");
  const diagnostics: ParsedDiagnostic[] = [];
  const seen = new Set<string>();

  const pushDiagnostic = (rawFile: string, line: number, column: number, message: string) => {
    const file = resolveDiagnosticFile(rawFile, workspaceFiles);
    if (!file) return;
    const safeLine = Math.max(1, Number.isFinite(line) ? line : 1);
    const safeCol = Math.max(1, Number.isFinite(column) ? column : 1);
    const text = message.trim() || "Runtime error";
    const key = `${file}:${safeLine}:${safeCol}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push({ file, line: safeLine, column: safeCol, message: text });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const pyTrace = line.match(/File ["'](.+?)["'], line (\d+)/);
    if (pyTrace) {
      pushDiagnostic(pyTrace[1], Number(pyTrace[2]), 1, line);
      continue;
    }

    const rustTrace = line.match(/-->\s+(.+?):(\d+):(\d+)/);
    if (rustTrace) {
      pushDiagnostic(rustTrace[1], Number(rustTrace[2]), Number(rustTrace[3]), line);
      continue;
    }

    const pos3 = line.match(/(?:at\s+)?(.+?\.[A-Za-z0-9]+):(\d+):(\d+)(?::\s*(.*))?$/);
    if (pos3) {
      pushDiagnostic(pos3[1], Number(pos3[2]), Number(pos3[3]), pos3[4] || line);
      continue;
    }

    const pos2 = line.match(/(.+?\.[A-Za-z0-9]+):(\d+):\s*(.*)$/);
    if (pos2) {
      pushDiagnostic(pos2[1], Number(pos2[2]), 1, pos2[3] || line);
    }
  }

  return diagnostics;
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
  const [runTarget, setRunTarget] = useState<string>("");
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    kind: "root",
    path: "",
  });
  const [dialogMode, setDialogMode] = useState<DialogMode>("none");
  const [dialogBasePath, setDialogBasePath] = useState("");
  const [dialogTargetPath, setDialogTargetPath] = useState("");
  const [dialogValue, setDialogValue] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [terminalLines, setTerminalLines] = useState<string[]>(["Nexus Runner ready."]);
  const [isRunning, setIsRunning] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const filesMapRef = useRef<Y.Map<Y.Text> | null>(null);
  const foldersMapRef = useRef<Y.Map<number> | null>(null);
  const localUpdateCounterRef = useRef(0);
  const activeFileRef = useRef(activeFile);
  const runAbortRef = useRef<AbortController | null>(null);
  const runCodeRef = useRef<() => void>(() => undefined);
  const stopRunRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  const sortedParticipants = useMemo(() => Object.keys(presence).sort(), [presence]);
  const tree = useMemo(() => buildTree(files, Array.from(new Set([...folders, ...extractFoldersFromFiles(files)]))), [files, folders]);
  const runnableFiles = useMemo(() => files.filter((file) => isRunnableFile(file)), [files]);
  const nexusEditorFiles = useMemo<NexusEditorFile[]>(
    () =>
      files.map((file) => {
        const shared = filesMapRef.current?.get(file);
        const text = file === activeFile ? content : shared?.toString() ?? "";
        return {
          id: file,
          name: file.split("/").pop() ?? file,
          path: file,
          content: text,
          language: toNexusLanguage(file),
          ghostText: file === activeFile ? "// AI suggestion: extract helper and add tests" : "",
        };
      }),
    [files, activeFile, content],
  );
  const editorPresence = useMemo(
    () =>
      Object.entries(presence)
        .filter(([username, cursor]) => username !== currentUser && !!cursor && (cursor?.file ?? activeFile) === activeFile)
        .map(([username, cursor]) => ({
          id: username,
          name: username,
          color: cursorColor(username),
          from: cursor ? cursor.anchor : 0,
          to: cursor ? cursor.head : 0,
        })),
    [presence, currentUser, activeFile],
  );

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
      if (runAbortRef.current) {
        runAbortRef.current.abort();
        runAbortRef.current = null;
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
    const next = pickDefaultRunTarget(runnableFiles, activeFile);
    if (!runTarget || !runnableFiles.includes(runTarget)) {
      setRunTarget(next);
    }
  }, [runnableFiles, runTarget, activeFile]);

  useEffect(() => {
    const closeMenu = () => setContextMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  useEffect(() => {
    if (!followTarget) return;
    const target = presence[followTarget];
    if (!target) return;

    if (target.file && target.file !== activeFile) {
      setActiveFile(target.file);
      return;
    }

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

  function sendPresence(file: string, anchor: number, head: number) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeSession || !file) return;

    ws.send(
      JSON.stringify({
        type: "presence.update",
        session_id: activeSession,
        cursor: {
          file,
          anchor,
          head,
        },
      }),
    );
  }

  function handleEditorChange(fileId: string, nextValue: string) {
    const value = nextValue ?? "";
    const filesMap = filesMapRef.current;
    if (!filesMap || !fileId) return;
    const ytext = filesMap.get(fileId);
    if (!ytext || value === ytext.toString()) return;

    ytext.doc?.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, value);
    }, "local");
  }

  function createFileAt(fullPathInput: string): boolean {
    const filesMap = filesMapRef.current;
    const doc = docRef.current;
    if (!filesMap || !doc) return false;

    const fullPath = normalizePath(fullPathInput);
    if (!fullPath) {
      setDialogError("File path cannot be empty.");
      return false;
    }
    if (filesMap.has(fullPath)) {
      setDialogError(`File already exists: ${fullPath}`);
      return false;
    }

    const foldersMap = foldersMapRef.current;
    const parts = fullPath.split("/");
    doc.transact(() => {
      let prefix = "";
      for (let i = 0; i < parts.length - 1; i += 1) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
        foldersMap?.set(prefix, 1);
      }

      const text = new Y.Text();
      text.insert(0, "");
      filesMap.set(fullPath, text);
    }, "local");

    let prefix = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      setExpandedFolders((prev) => ({ ...prev, [prefix]: true }));
    }
    setActiveFile(fullPath);
    return true;
  }

  function createFolderAt(folderPathInput: string): boolean {
    const foldersMap = foldersMapRef.current;
    const doc = docRef.current;
    if (!foldersMap || !doc) return false;

    const folderPath = normalizePath(folderPathInput);
    if (!folderPath) {
      setDialogError("Folder path cannot be empty.");
      return false;
    }
    if (foldersMap.has(folderPath)) {
      setDialogError(`Folder already exists: ${folderPath}`);
      return false;
    }

    doc.transact(() => {
      foldersMap.set(folderPath, 1);
    }, "local");
    setExpandedFolders((prev) => ({ ...prev, [folderPath]: true }));
    return true;
  }

  function renameFileAt(sourcePath: string, targetPathInput: string): boolean {
    const filesMap = filesMapRef.current;
    const doc = docRef.current;
    if (!filesMap || !doc) return false;

    const targetPath = normalizePath(targetPathInput);
    if (!targetPath) {
      setDialogError("Target path cannot be empty.");
      return false;
    }
    if (targetPath === sourcePath) return true;
    if (filesMap.has(targetPath)) {
      setDialogError(`File already exists: ${targetPath}`);
      return false;
    }

    const source = filesMap.get(sourcePath);
    if (!source) {
      setDialogError("Source file not found.");
      return false;
    }

    const foldersMap = foldersMapRef.current;
    const parts = targetPath.split("/");
    doc.transact(() => {
      const text = new Y.Text();
      text.insert(0, source.toString());
      filesMap.set(targetPath, text);
      filesMap.delete(sourcePath);

      let prefix = "";
      for (let i = 0; i < parts.length - 1; i += 1) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
        foldersMap?.set(prefix, 1);
      }
    }, "local");

    let prefix = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      setExpandedFolders((prev) => ({ ...prev, [prefix]: true }));
    }

    if (activeFile === sourcePath) setActiveFile(targetPath);
    setOpenedTabs((prev) => prev.map((tab) => (tab === sourcePath ? targetPath : tab)));
    setRunTarget((prev) => (prev === sourcePath ? targetPath : prev));
    return true;
  }

  function deleteFileAt(path: string): boolean {
    const filesMap = filesMapRef.current;
    const doc = docRef.current;
    if (!filesMap || !doc) return false;

    if (filesMap.size <= 1) {
      setDialogError("Cannot delete the last file.");
      return false;
    }

    doc.transact(() => {
      filesMap.delete(path);
    }, "local");
    setOpenedTabs((prev) => prev.filter((tab) => tab !== path));
    setRunTarget((prev) => (prev === path ? "" : prev));
    if (activeFile === path) {
      const remaining = Array.from(filesMap.keys()).sort((a, b) => a.localeCompare(b));
      setActiveFile(remaining[0] ?? "");
    }
    return true;
  }

  function deleteFolderAt(path: string): boolean {
    const filesMap = filesMapRef.current;
    const foldersMap = foldersMapRef.current;
    const doc = docRef.current;
    if (!filesMap || !foldersMap || !doc) return false;

    const filePrefix = `${path}/`;
    const affectedFiles = Array.from(filesMap.keys()).filter((file) => file.startsWith(filePrefix));
    if (filesMap.size - affectedFiles.length <= 0) {
      setDialogError("Cannot delete folder because it would remove all files.");
      return false;
    }

    doc.transact(() => {
      for (const file of affectedFiles) {
        filesMap.delete(file);
      }
      for (const folder of Array.from(foldersMap.keys())) {
        if (folder === path || folder.startsWith(`${path}/`)) foldersMap.delete(folder);
      }
    }, "local");

    setOpenedTabs((prev) => prev.filter((tab) => !tab.startsWith(filePrefix)));
    setRunTarget((prev) => (prev.startsWith(filePrefix) ? "" : prev));
    if (activeFile.startsWith(filePrefix)) {
      const remaining = Array.from(filesMap.keys()).sort((a, b) => a.localeCompare(b));
      setActiveFile(remaining[0] ?? "");
    }
    return true;
  }

  function closeDialog() {
    setDialogMode("none");
    setDialogBasePath("");
    setDialogTargetPath("");
    setDialogValue("");
    setDialogError(null);
  }

  function openDialog(mode: DialogMode, params?: { basePath?: string; targetPath?: string; value?: string }) {
    setDialogMode(mode);
    setDialogBasePath(params?.basePath ?? "");
    setDialogTargetPath(params?.targetPath ?? "");
    setDialogValue(params?.value ?? "");
    setDialogError(null);
    setContextMenu((prev) => ({ ...prev, open: false }));
  }

  function handleAddFile(folderPath = "") {
    openDialog("new-file", { basePath: folderPath, value: "new-file.ts" });
  }

  function handleAddFolder(parentPath = "") {
    openDialog("new-folder", { basePath: parentPath, value: "new-folder" });
  }

  function handleRenameFile(path: string) {
    openDialog("rename-file", { targetPath: path, value: path });
  }

  function handleDeleteFile(path: string) {
    openDialog("delete-file", { targetPath: path });
  }

  function handleDeleteFolder(path: string) {
    openDialog("delete-folder", { targetPath: path });
  }

  function submitDialog(event: FormEvent) {
    event.preventDefault();
    setDialogError(null);
    let ok = false;
    if (dialogMode === "new-file") {
      ok = createFileAt(joinPath(dialogBasePath, dialogValue));
    } else if (dialogMode === "new-folder") {
      ok = createFolderAt(joinPath(dialogBasePath, dialogValue));
    } else if (dialogMode === "rename-file") {
      ok = renameFileAt(dialogTargetPath, dialogValue);
    } else if (dialogMode === "delete-file") {
      ok = deleteFileAt(dialogTargetPath);
    } else if (dialogMode === "delete-folder") {
      ok = deleteFolderAt(dialogTargetPath);
    }
    if (ok) closeDialog();
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

  function openContextMenu(event: MouseEvent, kind: ContextMenuState["kind"], path: string) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      kind,
      path,
    });
  }

  function runTargetFromMenu(path: string) {
    if (!isRunnableFile(path)) return;
    setRunTarget(path);
    setActiveFile(path);
    setContextMenu((prev) => ({ ...prev, open: false }));
  }

  function runCode() {
    if (isRunning || !activeSession || !token) return;
    const filesMap = filesMapRef.current;
    if (!filesMap) return;
    const entryFile = runTarget || activeFile;
    if (!entryFile) {
      setTerminalLines((prev) => ["Select a run target first.", ...prev].slice(0, 120));
      return;
    }
    if (!isRunnableFile(entryFile)) {
      setTerminalLines((prev) => [`Unsupported run target: ${entryFile}`, ...prev].slice(0, 120));
      return;
    }

    const filesPayload: Record<string, string> = {};
    for (const [path, ytext] of filesMap.entries()) {
      filesPayload[path] = ytext.toString();
    }

    const stamp = new Date().toLocaleTimeString();
    const lang = getLanguage(entryFile);
    const controller = new AbortController();
    runAbortRef.current = controller;

    setIsRunning(true);
    setTerminalLines((prev) => [`[${stamp}] ▶ Running ${entryFile} (${lang})`, ...prev].slice(0, 120));

    fetch(`${API_URL}/api/core/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        session_id: activeSession,
        entry_file: entryFile,
        files: filesPayload,
        timeout_seconds: 10,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.detail ? String(data.detail) : "Run failed");
        }
        return data as {
          ok: boolean;
          command: string;
          exit_code: number;
          stdout: string;
          stderr: string;
          duration_ms: number;
        };
      })
      .then((result) => {
        const rawOutput = `${result.stderr || ""}\n${result.stdout || ""}`;
        const parsed = parseRunDiagnostics(rawOutput, Object.keys(filesPayload));

        setTerminalLines((prev) => {
          const next = [...prev];
          next.unshift(`$ ${result.command || "<no command>"}`);
          next.unshift(`exit_code=${result.exit_code} • ${result.duration_ms}ms`);
          if (result.stdout) {
            for (const line of result.stdout.split("\n").filter(Boolean).reverse()) {
              next.unshift(`stdout: ${line}`);
            }
          }
          if (result.stderr) {
            for (const line of result.stderr.split("\n").filter(Boolean).reverse()) {
              next.unshift(`stderr: ${line}`);
            }
          }
          if (result.ok) {
            next.unshift("Execution finished successfully.");
          } else {
            next.unshift("Execution finished with errors.");
            if (parsed.length > 0) {
              next.unshift(`Diagnostics: ${parsed.length} marker(s) added in editor.`);
            }
          }
          return next.slice(0, 120);
        });
      })
      .catch((err: unknown) => {
        const text =
          err instanceof DOMException && err.name === "AbortError"
            ? "Execution interrupted by user."
            : `Run error: ${String(err)}`;
        setTerminalLines((prev) => [text, ...prev].slice(0, 120));
      })
      .finally(() => {
        setIsRunning(false);
        if (runAbortRef.current === controller) {
          runAbortRef.current = null;
        }
      });
  }

  function stopRun() {
    if (runAbortRef.current) {
      runAbortRef.current.abort();
      runAbortRef.current = null;
    }
  }

  useEffect(() => {
    runCodeRef.current = runCode;
    stopRunRef.current = stopRun;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
      event.preventDefault();
      if (event.shiftKey) {
        stopRunRef.current();
      } else {
        runCodeRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  function renderTree(nodes: TreeNode[], depth = 0): JSX.Element[] {
    const rendered: JSX.Element[] = [];

    for (const node of nodes) {
      if (node.type === "folder") {
        const expanded = expandedFolders[node.path] ?? depth < 1;
        rendered.push(
          <li key={node.path}>
            <div className="core-tree-row" style={{ paddingLeft: 10 + depth * 14 }} onContextMenu={(event) => openContextMenu(event, "folder", node.path)}>
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
            <div className="core-tree-row" style={{ paddingLeft: 30 + depth * 14 }} onContextMenu={(event) => openContextMenu(event, "file", node.path)}>
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
    <div className="core-page-root">
      <section className="core-launchbar">
        <div className="core-launchbar-left">
          <Link href="/dashboard" className="link-btn">
            ← Dashboard
          </Link>
          <span className="core-launch-title">The Core</span>
          {isConnected ? <span className="badge status-doing">Live</span> : <span className="badge status-backlog">Offline</span>}
          {error ? <span className="core-launch-error">{error}</span> : null}
        </div>

        <form onSubmit={createSession} className="core-launchbar-right">
          <input className="text-input" data-testid="core-project-input" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project ID" />
          <input className="text-input" data-testid="core-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Session name" />
          <button type="submit" className="primary-btn" data-testid="core-create-submit" disabled={isCreating || !name.trim() || !projectId.trim()}>
            {isCreating ? "Creating..." : "Create"}
          </button>
          <select className="text-input" value={activeSession ?? ""} onChange={(e) => setActiveSession(Number(e.target.value))} aria-label="Select session">
            {isSessionsLoading ? <option value="">Loading...</option> : null}
            {!isSessionsLoading && sessions.length === 0 ? <option value="">No sessions</option> : null}
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                #{session.id} {session.name}
              </option>
            ))}
          </select>
        </form>
      </section>

      <EditorShell
        tree={tree}
        activeFile={activeFile}
        openedTabs={openedTabs}
        content={content}
        language={getLanguage(activeFile)}
        terminalLines={terminalLines}
        isRunning={isRunning}
        isConnected={isConnected}
        version={version}
        expandedFolders={expandedFolders}
        sessionName={sessions.find((s) => s.id === activeSession)?.name}
        sessionId={activeSession}
        runTarget={runTarget}
        runnableFiles={runnableFiles}
        participantCount={sortedParticipants.length}
        followTarget={followTarget}
        currentUser={currentUser}
        participants={sortedParticipants}
        onFileSelect={setActiveFile}
        onTabClose={closeTab}
        onToggleFolder={toggleFolder}
        onEditorMount={() => { }}
        onRunCode={() => runCodeRef.current()}
        onStopRun={() => stopRunRef.current()}
        onSaveSnapshot={saveSnapshotNow}
        onRunTargetChange={setRunTarget}
        onNewFile={handleAddFile}
      onNewFolder={handleAddFolder}
      onFollow={handleFollow}
      onStopFollow={stopFollow}
      editorContainer={
          <NexusEditor
            files={nexusEditorFiles}
            activeFileId={activeFile}
            onActiveFileChange={setActiveFile}
            onFileClose={closeTab}
            onContentChange={handleEditorChange}
            presenceCursors={editorPresence}
            onSelectionChange={(file, anchor, head) => sendPresence(file, anchor, head)}
            className="h-full"
          />
        }
      />

      {/* Context menu */}
      {contextMenu.open ? (
        <div className="core-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="core-context-item" onClick={() => handleAddFile(contextMenu.kind === "folder" ? contextMenu.path : "")}>
            New File
          </button>
          <button type="button" className="core-context-item" onClick={() => handleAddFolder(contextMenu.kind === "folder" ? contextMenu.path : "")}>
            New Folder
          </button>
          {contextMenu.kind === "file" ? (
            <>
              <button type="button" className="core-context-item" onClick={() => handleRenameFile(contextMenu.path)}>
                Rename File
              </button>
              <button type="button" className="core-context-item" onClick={() => runTargetFromMenu(contextMenu.path)} disabled={!isRunnableFile(contextMenu.path)}>
                Set Run Target
              </button>
              <button type="button" className="core-context-item danger" onClick={() => handleDeleteFile(contextMenu.path)}>
                Delete File
              </button>
            </>
          ) : null}
          {contextMenu.kind === "folder" ? (
            <button type="button" className="core-context-item danger" onClick={() => handleDeleteFolder(contextMenu.path)}>
              Delete Folder
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Dialog modal */}
      {dialogMode !== "none" ? (
        <div className="core-modal-overlay" onClick={closeDialog}>
          <form className="core-modal" onSubmit={submitDialog} onClick={(event) => event.stopPropagation()}>
            <h3 className="core-modal-title">
              {dialogMode === "new-file" ? "Create File" : null}
              {dialogMode === "new-folder" ? "Create Folder" : null}
              {dialogMode === "rename-file" ? "Rename File" : null}
              {dialogMode === "delete-file" ? "Delete File" : null}
              {dialogMode === "delete-folder" ? "Delete Folder" : null}
            </h3>

            {(dialogMode === "new-file" || dialogMode === "new-folder" || dialogMode === "rename-file") ? (
              <label className="core-modal-label">
                <span>Path</span>
                <input
                  className="text-input"
                  value={dialogValue}
                  onChange={(event) => setDialogValue(event.target.value)}
                  autoFocus
                />
              </label>
            ) : null}

            {(dialogMode === "delete-file" || dialogMode === "delete-folder") ? (
              <p className="subtle">
                Confirm deletion: <strong>{dialogTargetPath}</strong>
              </p>
            ) : null}

            {dialogError ? <p className="empty">{dialogError}</p> : null}

            <div className="core-modal-actions">
              <button type="button" className="secondary-btn" onClick={closeDialog}>
                Cancel
              </button>
              <button type="submit" className={dialogMode.startsWith("delete") ? "core-danger-btn" : "primary-btn"}>
                Confirm
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div style={{ display: "none" }}>
        {sessions.map((session) => (
          <button key={session.id} data-testid={`core-connect-${session.id}`} onClick={() => setActiveSession(session.id)}>
            Connect {session.id}
          </button>
        ))}
      </div>
    </div>
  );
}
