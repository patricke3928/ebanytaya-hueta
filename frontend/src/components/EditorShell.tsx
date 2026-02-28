"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
    Bot,
    ChevronDown,
    ChevronRight,
    Circle,
    File,
    FilePlus,
    Folder,
    FolderOpen,
    FolderPlus,
    Play,
    Send,
    ShieldCheck,
    Settings,
    Square,
    Terminal,
    Users,
    Wifi,
    WifiOff,
    X,
    Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type TreeNode = {
    name: string;
    path: string;
    type: "file" | "folder";
    children: TreeNode[];
};

export type AiMessage = {
    role: "user" | "assistant";
    content: string;
};

export interface EditorShellProps {
    /** File tree */
    tree: TreeNode[];
    /** Currently active file path */
    activeFile: string;
    /** Open tabs */
    openedTabs: string[];
    /** Current editor content */
    content: string;
    /** Monaco language id */
    language: string;
    /** Terminal output lines */
    terminalLines: string[];
    /** Is runner executing */
    isRunning: boolean;
    /** Is WS connected */
    isConnected: boolean;
    /** Collab version */
    version: number;
    /** Expanded folder state */
    expandedFolders: Record<string, boolean>;
    /** Session name */
    sessionName?: string;
    /** Active session id */
    sessionId?: number | null;
    /** Run target file */
    runTarget: string;
    /** Runnable files */
    runnableFiles: string[];
    /** Number of collaborators visible in presence panel */
    participantCount: number;
    /** Follow mode target */
    followTarget: string | null;
    /** Current user */
    currentUser: string;
    /** Sorted usernames in presence */
    participants: string[];

    /* Callbacks */
    onFileSelect: (path: string) => void;
    onTabClose: (path: string) => void;
    onToggleFolder: (path: string) => void;
    onEditorMount: (editorSlot: (node: HTMLDivElement | null) => void) => void;
    onRunCode: () => void;
    onStopRun: () => void;
    onSaveSnapshot: () => void;
    onRunTargetChange: (path: string) => void;
    onNewFile: (basePath: string) => void;
    onNewFolder: (basePath: string) => void;
    onFollow: (user: string) => void;
    onStopFollow: () => void;

    /** Render the Monaco editor into this container */
    editorContainer: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function getFileIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase();
    const colors: Record<string, string> = {
        ts: "#3178c6",
        tsx: "#3178c6",
        js: "#f7df1e",
        jsx: "#f7df1e",
        py: "#3572a5",
        go: "#00add8",
        rs: "#dea584",
        md: "#6c8ebf",
        json: "#cbcb41",
        css: "#563d7c",
        sql: "#e38c00",
    };
    return { color: colors[ext ?? ""] ?? "#888" };
}

function FileIcon({ name }: { name: string }) {
    const { color } = getFileIcon(name);
    return <File size={13} style={{ color }} />;
}

/* ------------------------------------------------------------------ */
/* FileTree                                                             */
/* ------------------------------------------------------------------ */

function TreeItem({
    node,
    depth,
    activeFile,
    expandedFolders,
    onFileSelect,
    onToggleFolder,
    onNewFile,
    onNewFolder,
}: {
    node: TreeNode;
    depth: number;
    activeFile: string;
    expandedFolders: Record<string, boolean>;
    onFileSelect: (p: string) => void;
    onToggleFolder: (p: string) => void;
    onNewFile: (p: string) => void;
    onNewFolder: (p: string) => void;
}) {
    const isOpen = expandedFolders[node.path] ?? false;
    const isActive = node.type === "file" && node.path === activeFile;
    const indent = depth * 12;

    if (node.type === "folder") {
        return (
            <div>
                <div
                    className="ide-tree-row ide-tree-folder"
                    style={{ paddingLeft: 8 + indent }}
                    onClick={() => onToggleFolder(node.path)}
                >
                    <span className="ide-tree-arrow">
                        {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </span>
                    {isOpen ? (
                        <FolderOpen size={13} className="ide-folder-icon open" />
                    ) : (
                        <Folder size={13} className="ide-folder-icon" />
                    )}
                    <span className="ide-tree-label">{node.name}</span>
                    <span className="ide-tree-actions">
                        <button
                            className="ide-tree-action-btn"
                            title="New File"
                            onClick={(e) => {
                                e.stopPropagation();
                                onNewFile(node.path);
                            }}
                        >
                            <FilePlus size={11} />
                        </button>
                        <button
                            className="ide-tree-action-btn"
                            title="New Folder"
                            onClick={(e) => {
                                e.stopPropagation();
                                onNewFolder(node.path);
                            }}
                        >
                            <FolderPlus size={11} />
                        </button>
                    </span>
                </div>
                <AnimatePresence initial={false}>
                    {isOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            style={{ overflow: "hidden" }}
                        >
                            {node.children.map((child) => (
                                <TreeItem
                                    key={child.path}
                                    node={child}
                                    depth={depth + 1}
                                    activeFile={activeFile}
                                    expandedFolders={expandedFolders}
                                    onFileSelect={onFileSelect}
                                    onToggleFolder={onToggleFolder}
                                    onNewFile={onNewFile}
                                    onNewFolder={onNewFolder}
                                />
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div
            className={`ide-tree-row ide-tree-file${isActive ? " active" : ""}`}
            style={{ paddingLeft: 8 + indent + 14 }}
            onClick={() => onFileSelect(node.path)}
        >
            <FileIcon name={node.name} />
            <span className="ide-tree-label">{node.name}</span>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* AI Panel                                                             */
/* ------------------------------------------------------------------ */

function AiPanel({ onClose }: { onClose: () => void }) {
    const [messages, setMessages] = useState<AiMessage[]>([
        {
            role: "assistant",
            content: "Привет! Я Brain — твой AI-напарник. Спроси что угодно о коде.",
        },
    ]);
    const [input, setInput] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);

    function sendMsg() {
        const text = input.trim();
        if (!text) return;
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setInput("");
        setTimeout(() => {
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "Анализирую… (подключи OpenAI API для реальных ответов 🔌)",
                },
            ]);
        }, 600);
    }

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <motion.div
            className="ide-ai-panel"
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
        >
            <div className="ide-ai-header">
                <Bot size={14} />
                <span>Brain</span>
                <button className="ide-icon-btn" onClick={onClose}>
                    <X size={14} />
                </button>
            </div>
            <div className="ide-ai-messages">
                {messages.map((m, i) => (
                    <div key={i} className={`ide-ai-msg ${m.role}`}>
                        {m.content}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
            <div className="ide-ai-input-row">
                <input
                    className="ide-ai-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMsg()}
                    placeholder="Спроси Brain…"
                />
                <button className="ide-icon-btn highlight" onClick={sendMsg}>
                    <Send size={13} />
                </button>
            </div>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/* Main EditorShell                                                     */
/* ------------------------------------------------------------------ */

export function EditorShell({
    tree,
    activeFile,
    openedTabs,
    terminalLines,
    isRunning,
    isConnected,
    version,
    expandedFolders,
    sessionName,
    sessionId,
    runTarget,
    runnableFiles,
    participantCount,
    followTarget,
    currentUser,
    participants,
    onFileSelect,
    onTabClose,
    onToggleFolder,
    onRunCode,
    onStopRun,
    onSaveSnapshot,
    onRunTargetChange,
    onNewFile,
    onNewFolder,
    onFollow,
    onStopFollow,
    editorContainer,
}: EditorShellProps) {
    const [showExplorer, setShowExplorer] = useState(true);
    const [showAi, setShowAi] = useState(false);
    const [showCollab, setShowCollab] = useState(true);
    const [showTerminal, setShowTerminal] = useState(true);
    const [isTablet, setIsTablet] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const termRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        termRef.current?.scrollTo(0, termRef.current.scrollHeight);
    }, [terminalLines]);

    useEffect(() => {
        const applyScreenMode = () => {
            const width = window.innerWidth;
            const nextTablet = width <= 1200;
            const nextMobile = width <= 860;
            setIsTablet(nextTablet);
            setIsMobile(nextMobile);

            // Auto-compact on smaller screens to avoid overlapping panes.
            if (nextMobile) {
                setShowExplorer(false);
                setShowAi(false);
                setShowCollab(false);
                setShowTerminal(false);
            } else if (nextTablet) {
                setShowAi(false);
            }
        };

        applyScreenMode();
        window.addEventListener("resize", applyScreenMode);
        return () => window.removeEventListener("resize", applyScreenMode);
    }, []);

    return (
        <div className={`ide-shell vscode-apple${isTablet ? " is-tablet" : ""}${isMobile ? " is-mobile" : ""}`}>
            <header className="ide-titlebar">
                <div className="ide-traffic" aria-hidden="true">
                    <span className="dot red" />
                    <span className="dot amber" />
                    <span className="dot green" />
                </div>
                <div className="ide-title-center">
                    <span className="ide-title-session">{sessionName || "Nexus Core"}</span>
                    <span className="ide-title-sep">·</span>
                    <span className="ide-title-file">{activeFile || "No file selected"}</span>
                </div>
                <div className="ide-title-actions">
                    <button className="ide-title-btn" type="button" onClick={() => setShowExplorer((v) => !v)}>
                        Explorer
                    </button>
                    <button className="ide-title-btn" type="button" onClick={() => setShowTerminal((v) => !v)}>
                        Terminal
                    </button>
                    <button className="ide-title-btn" type="button" onClick={() => setShowAi((v) => !v)}>
                        Brain
                    </button>
                </div>
            </header>
            <div className="ide-main-row">
                {/* ── Activity Bar ── */}
                <nav className="ide-activity-bar">
                    <div className="ide-activity-top">
                        <button
                            className={`ide-activity-btn${showExplorer ? " active" : ""}`}
                            title="Файловый менеджер"
                            onClick={() => setShowExplorer((v) => !v)}
                        >
                            <Folder size={20} />
                        </button>
                        <button
                            className="ide-activity-btn"
                            title="Терминал"
                            onClick={() => setShowTerminal((v) => !v)}
                        >
                            <Terminal size={20} />
                        </button>
                        <button
                            className={`ide-activity-btn${showCollab ? " active" : ""}`}
                            title="Collab"
                            onClick={() => setShowCollab((v) => !v)}
                        >
                            <Users size={20} />
                        </button>
                        <button
                            className={`ide-activity-btn${showAi ? " active" : ""}`}
                            title="Brain AI"
                            onClick={() => setShowAi((v) => !v)}
                        >
                            <Bot size={20} />
                        </button>
                    </div>
                    <div className="ide-activity-bottom">
                        <div
                            className={`ide-status-dot ${isConnected ? "connected" : "disconnected"}`}
                            title={isConnected ? `Sync v${version}` : "Не подключено"}
                        >
                            {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
                        </div>
                        <button className="ide-activity-btn" title="Настройки">
                            <Settings size={20} />
                        </button>
                    </div>
                </nav>

                {/* ── Main layout ── */}
                <div className="ide-body">
                    <Group
                        key={`outer-${showExplorer ? "1" : "0"}-${showAi ? "1" : "0"}-${showTerminal ? "1" : "0"}`}
                        direction="horizontal"
                        className="ide-panel-group-h"
                    >
                    {/* ── Sidebar Explorer ── */}
                    <AnimatePresence initial={false}>
                        {showExplorer && (
                            <>
                                <Panel
                                    id="explorer"
                                    order={1}
                                    defaultSize={isTablet ? 24 : 18}
                                    minSize={isTablet ? 18 : 12}
                                    maxSize={35}
                                    className="ide-sidebar"
                                >
                                    <motion.div
                                        className="ide-sidebar-inner"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        <div className="ide-sidebar-header">
                                            <span>EXPLORER</span>
                                            <div className="ide-sidebar-actions">
                                                <button
                                                    className="ide-icon-btn"
                                                    data-testid="core-explorer-new-file"
                                                    title="Новый файл"
                                                    onClick={() => onNewFile("")}
                                                >
                                                    <FilePlus size={13} />
                                                </button>
                                                <button
                                                    className="ide-icon-btn"
                                                    data-testid="core-explorer-new-folder"
                                                    title="Новая папка"
                                                    onClick={() => onNewFolder("")}
                                                >
                                                    <FolderPlus size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="ide-tree core-explorer">
                                            {tree.length === 0 && (
                                                <p className="ide-tree-empty">Нет файлов</p>
                                            )}
                                            {tree.map((node) => (
                                                <TreeItem
                                                    key={node.path}
                                                    node={node}
                                                    depth={0}
                                                    activeFile={activeFile}
                                                    expandedFolders={expandedFolders}
                                                    onFileSelect={onFileSelect}
                                                    onToggleFolder={onToggleFolder}
                                                    onNewFile={onNewFile}
                                                    onNewFolder={onNewFolder}
                                                />
                                            ))}
                                        </div>
                                    </motion.div>
                                </Panel>
                                <Separator className="ide-resize-handle" />
                            </>
                        )}
                    </AnimatePresence>

                    {/* ── Editor + Terminal ── */}
                    <Panel id="center" order={2} className="ide-center">
                        <Group direction="vertical" className="ide-panel-group-v">
                            <Panel id="editor-stack" order={1} className="ide-editor-panel">
                                <div className="ide-commandbar">
                                    <div className="ide-commandbar-left">
                                        <span className="ide-command-pill">
                                            <ShieldCheck size={12} />
                                            {isConnected ? "Live Sync" : "Offline"}
                                        </span>
                                        {sessionId ? <span className="ide-command-pill">Session #{sessionId}</span> : null}
                                        <span className="ide-command-pill">Peers {participantCount}</span>
                                        {followTarget ? <span className="ide-command-pill">Following {followTarget}</span> : null}
                                    </div>
                                    <div className="ide-commandbar-right">
                                        <label className="ide-run-target">
                                            <span>Run Target</span>
                                            <select
                                                className="ide-run-target-select"
                                                data-testid="core-run-target"
                                                value={runTarget}
                                                onChange={(event) => onRunTargetChange(event.target.value)}
                                            >
                                                {runnableFiles.length === 0 ? <option value="">No runnable files</option> : null}
                                                {runnableFiles.map((file) => (
                                                    <option key={file} value={file}>
                                                        {file}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <button className="ide-ghost-btn" onClick={onSaveSnapshot} type="button">
                                            Snapshot
                                        </button>
                                    </div>
                                </div>

                                <Group
                                    key={`editor-${showCollab ? "1" : "0"}`}
                                    direction="horizontal"
                                    className="ide-editor-split"
                                >
                                    <Panel id="editor-main" order={1} className="ide-editor-main">
                                        {/* Tabs */}
                                        <div className="ide-tabs">
                                            {openedTabs.map((tab) => {
                                                const name = tab.split("/").pop() ?? tab;
                                                const isActive = tab === activeFile;
                                                return (
                                                    <div
                                                        key={tab}
                                                        className={`ide-tab${isActive ? " active" : ""}`}
                                                        onClick={() => onFileSelect(tab)}
                                                    >
                                                        <FileIcon name={name} />
                                                        <span className="ide-tab-name">{name}</span>
                                                        <button
                                                            className="ide-tab-close"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onTabClose(tab);
                                                            }}
                                                        >
                                                            <X size={11} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            <div className="ide-tabs-actions">
                                                <button
                                                    className={`ide-run-btn${isRunning ? " running" : ""}`}
                                                    onClick={isRunning ? onStopRun : onRunCode}
                                                    title={isRunning ? "Остановить" : "Запустить"}
                                                    disabled={!runTarget}
                                                >
                                                    {isRunning ? (
                                                        <>
                                                            <Square size={12} />
                                                            <span>Stop</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Play size={12} />
                                                            <span>Run</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Breadcrumb */}
                                        {activeFile && (
                                            <div className="ide-breadcrumb">
                                                {activeFile.split("/").map((seg, i, arr) => (
                                                    <span key={i} className="ide-breadcrumb-seg">
                                                        {i < arr.length - 1 ? (
                                                            <>
                                                                <span className="ide-breadcrumb-folder">{seg}</span>
                                                                <ChevronRight size={11} className="ide-breadcrumb-sep" />
                                                            </>
                                                        ) : (
                                                            <span className="ide-breadcrumb-file">{seg}</span>
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Editor slot */}
                                        <div className="ide-editor-area" data-testid="core-editor">{editorContainer}</div>
                                    </Panel>

                                    {(showCollab || showAi) && (
                                        <>
                                            <Separator className="ide-resize-handle" />
                                            <Panel
                                                id="right-dock"
                                                order={2}
                                                defaultSize={24}
                                                minSize={18}
                                                maxSize={42}
                                                className="ide-right-dock"
                                            >
                                                {showCollab && showAi ? (
                                                    <Group direction="vertical" className="ide-panel-group-v">
                                                        <Panel defaultSize={44} minSize={24} className="ide-right-collab-wrap">
                                                            <aside className="ide-collab-widget docked">
                                                                <div className="ide-collab-widget-head">
                                                                    <span>COLLAB</span>
                                                                    <button
                                                                        type="button"
                                                                        className="ide-icon-btn"
                                                                        data-testid="core-follow-stop"
                                                                        onClick={onStopFollow}
                                                                        disabled={!followTarget}
                                                                        title="Stop follow"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                                <div className="ide-collab-widget-body">
                                                                    {participants.length === 0 ? <span className="ide-collab-empty">No peers</span> : null}
                                                                    {participants.map((user) => (
                                                                        <span key={user} className="ide-collab-inline-item">
                                                                            <span className="ide-collab-name">{user}</span>
                                                                            {user !== currentUser ? (
                                                                                <button
                                                                                    type="button"
                                                                                    className="ide-collab-follow"
                                                                                    data-testid={`core-follow-${user}`}
                                                                                    onClick={() => onFollow(user)}
                                                                                >
                                                                                    Follow
                                                                                </button>
                                                                            ) : (
                                                                                <span className="ide-collab-you">You</span>
                                                                            )}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </aside>
                                                        </Panel>
                                                        <Separator className="ide-resize-handle horizontal" />
                                                        <Panel defaultSize={56} minSize={24} className="ide-right-ai-wrap">
                                                            <AiPanel onClose={() => setShowAi(false)} />
                                                        </Panel>
                                                    </Group>
                                                ) : showCollab ? (
                                                    <div className="ide-right-collab-wrap">
                                                        <aside className="ide-collab-widget docked">
                                                            <div className="ide-collab-widget-head">
                                                                <span>COLLAB</span>
                                                                <button
                                                                    type="button"
                                                                    className="ide-icon-btn"
                                                                    data-testid="core-follow-stop"
                                                                    onClick={onStopFollow}
                                                                    disabled={!followTarget}
                                                                    title="Stop follow"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                            <div className="ide-collab-widget-body">
                                                                {participants.length === 0 ? <span className="ide-collab-empty">No peers</span> : null}
                                                                {participants.map((user) => (
                                                                    <span key={user} className="ide-collab-inline-item">
                                                                        <span className="ide-collab-name">{user}</span>
                                                                        {user !== currentUser ? (
                                                                            <button
                                                                                type="button"
                                                                                className="ide-collab-follow"
                                                                                data-testid={`core-follow-${user}`}
                                                                                onClick={() => onFollow(user)}
                                                                            >
                                                                                Follow
                                                                            </button>
                                                                        ) : (
                                                                            <span className="ide-collab-you">You</span>
                                                                        )}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </aside>
                                                    </div>
                                                ) : (
                                                    <div className="ide-right-ai-wrap">
                                                        <AiPanel onClose={() => setShowAi(false)} />
                                                    </div>
                                                )}
                                            </Panel>
                                        </>
                                    )}
                                </Group>
                            </Panel>

                            {/* ── Terminal ── */}
                            <AnimatePresence initial={false}>
                                {showTerminal && (
                                    <>
                                        <Separator className="ide-resize-handle horizontal" />
                                        <Panel
                                            id="terminal"
                                            order={2}
                                            defaultSize={22}
                                            minSize={8}
                                            maxSize={50}
                                            className="ide-terminal-panel"
                                        >
                                            <motion.div
                                                className="ide-terminal"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                transition={{ duration: 0.15 }}
                                            >
                                                <div className="ide-terminal-header">
                                                    <Terminal size={12} />
                                                    <span>TERMINAL</span>
                                                    {isRunning && (
                                                        <span className="ide-terminal-running">
                                                            <Circle size={7} className="blink" /> running
                                                        </span>
                                                    )}
                                                    <button
                                                        className="ide-icon-btn ml-auto"
                                                        onClick={() => setShowTerminal(false)}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                                <div className="ide-terminal-body" ref={termRef}>
                                                    {terminalLines.map((line, i) => (
                                                        <div key={i} className="ide-terminal-line">
                                                            <span className="ide-terminal-prompt">❯</span>
                                                            <span>{line}</span>
                                                        </div>
                                                    ))}
                                                    <div className="ide-terminal-cursor" />
                                                </div>
                                            </motion.div>
                                        </Panel>
                                    </>
                                )}
                            </AnimatePresence>
                        </Group>
                    </Panel>

                    </Group>
                </div>
            </div>

            {/* ── Status Bar ── */}
            <footer className="ide-statusbar">
                <span className={`ide-status-badge ${isConnected ? "ok" : "err"}`}>
                    {isConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
                    {isConnected ? `Sync · v${version}` : "Offline"}
                </span>
                {sessionName && <span className="ide-status-item">{sessionName}</span>}
                <span className="ide-status-item">{activeFile || "No file selected"}</span>
                {runTarget ? <span className="ide-status-item">Run: {runTarget}</span> : null}
                <span className="ide-status-item ml-auto">
                    <Zap size={11} /> Nexus Core
                </span>
            </footer>
        </div>
    );
}
