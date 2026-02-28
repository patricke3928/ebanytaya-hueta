"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { keymap, type EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

import {
  buildNexusExtensions,
  updatePresenceCursors,
  type NexusLanguage,
  type PresenceCursor,
} from "@/components/nexus-editor/codemirrorConfig";

export type NexusEditorFile = {
  id: string;
  name: string;
  path: string;
  content: string;
  language: NexusLanguage;
  ghostText?: string;
};

export type YjsBindingAdapter = {
  bind: (view: EditorView, fileId: string) => void;
  unbind?: (view: EditorView, fileId: string) => void;
};

type Props = {
  files: NexusEditorFile[];
  activeFileId: string;
  onActiveFileChange: (fileId: string) => void;
  onFileClose?: (fileId: string) => void;
  onContentChange: (fileId: string, next: string) => void;
  onSelectionChange?: (fileId: string, anchor: number, head: number) => void;
  presenceCursors?: PresenceCursor[];
  yjsAdapter?: YjsBindingAdapter;
  className?: string;
};

function detectStickySymbol(text: string, line: number): string {
  const rows = text.split("\n");
  const max = Math.min(rows.length - 1, Math.max(0, line - 1));
  const re =
    /^\s*(export\s+)?(async\s+)?(function|class|interface|type|const\s+\w+\s*=\s*\(|def\s+\w+|class\s+\w+)/;

  for (let i = max; i >= 0; i -= 1) {
    const row = rows[i].trim();
    if (!row) continue;
    if (re.test(row)) return row;
  }
  return "";
}

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatLanguageLabel(language: NexusLanguage): string {
  if (language === "typescript") return "TypeScript";
  if (language === "javascript") return "JavaScript";
  if (language === "python") return "Python";
  return "Plain Text";
}

export function NexusEditor({
  files,
  activeFileId,
  onActiveFileChange,
  onFileClose,
  onContentChange,
  onSelectionChange,
  presenceCursors = [],
  yjsAdapter,
  className = "",
}: Props) {
  const activeFile = useMemo(
    () => files.find((file) => file.id === activeFileId) ?? files[0] ?? null,
    [files, activeFileId],
  );

  const viewRef = useRef<EditorView | null>(null);
  const [localGhostText, setLocalGhostText] = useState("");
  const [showMinimap, setShowMinimap] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(1);
  const [clientHeight, setClientHeight] = useState(1);
  const [lineHeight, setLineHeight] = useState(20);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  useEffect(() => {
    setLocalGhostText(activeFile?.ghostText?.trim() ?? "");
  }, [activeFile?.id, activeFile?.ghostText]);

  const acceptGhostExtension = useMemo<Extension>(() => {
    return keymap.of([
      {
        key: "Tab",
        run: (view) => {
          const ghost = localGhostText.trim();
          if (!ghost) return false;
          const head = view.state.selection.main.head;
          view.dispatch({ changes: { from: head, to: head, insert: ghost } });
          setLocalGhostText("");
          return true;
        },
      },
    ]);
  }, [localGhostText]);

  const extensions = useMemo<Extension[]>(
    () => [...buildNexusExtensions(activeFile?.language ?? "plaintext", localGhostText), acceptGhostExtension],
    [activeFile?.language, localGhostText, acceptGhostExtension],
  );

  useEffect(() => {
    if (!viewRef.current) return;
    updatePresenceCursors(viewRef.current, presenceCursors);
  }, [presenceCursors]);

  useEffect(() => {
    if (!viewRef.current || !activeFile || !yjsAdapter) return;
    yjsAdapter.bind(viewRef.current, activeFile.id);
    return () => {
      if (viewRef.current) yjsAdapter.unbind?.(viewRef.current, activeFile.id);
    };
  }, [activeFile, yjsAdapter]);

  const stickySymbol = useMemo(() => {
    if (!activeFile) return "";
    const topLine = Math.max(1, Math.floor(scrollTop / lineHeight) + 1);
    return detectStickySymbol(activeFile.content, topLine);
  }, [activeFile, scrollTop, lineHeight]);

  const activeLines = useMemo(() => (activeFile ? activeFile.content.split("\n") : [""]), [activeFile]);
  const lineCount = activeLines.length;
  const charCount = activeFile?.content.length ?? 0;

  const minimapViewportHeight = clampPct((clientHeight / Math.max(1, scrollHeight)) * 100);
  const minimapViewportTop = clampPct((scrollTop / Math.max(1, scrollHeight)) * 100);

  const minimapRows = useMemo(
    () =>
      activeLines.slice(0, 420).map((line, i) => {
        const width = Math.min(100, 10 + line.length * 1.35);
        const alpha = Math.min(1, Math.max(0.22, line.length / 90));
        return { id: `${activeFile?.id ?? "none"}-${i}`, width, alpha };
      }),
    [activeLines, activeFile?.id],
  );

  if (!activeFile) {
    return (
      <div className="h-full rounded-xl border border-white/10 bg-[#090c12]/70 p-4 text-sm text-slate-300">
        No open files
      </div>
    );
  }

  return (
    <section
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#050505]/80 shadow-[0_16px_34px_rgba(0,0,0,0.36)] ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-white/[0.04] to-white/[0.02] px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {files.map((file) => {
            const active = file.id === activeFile.id;
            return (
              <div
                key={file.id}
                className={`group flex max-w-[240px] items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                  active
                    ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                    : "border-white/10 bg-white/[0.02] text-slate-300"
                }`}
              >
                <button type="button" className="truncate" onClick={() => onActiveFileChange(file.id)}>
                  {file.name}
                </button>
                {onFileClose ? (
                  <button
                    type="button"
                    className="rounded px-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                    onClick={() => onFileClose(file.id)}
                    aria-label={`Close ${file.name}`}
                  >
                    x
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300">
            {formatLanguageLabel(activeFile.language)}
          </span>
          <button
            type="button"
            className="rounded-md border border-white/12 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-200 transition hover:bg-white/10"
            onClick={() => setShowMinimap((v) => !v)}
          >
            {showMinimap ? "Hide Minimap" : "Show Minimap"}
          </button>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#070b12]/80 px-3 py-1 text-[11px] text-slate-300">
        <div className="truncate text-slate-300/90">{activeFile.path}</div>
        <div className="flex items-center gap-2 text-slate-400">
          <span>{presenceCursors.length} peers</span>
          {localGhostText ? <span className="text-cyan-200/90">Tab to accept AI suggestion</span> : null}
        </div>
      </div>

      {stickySymbol ? (
        <div className="pointer-events-none absolute left-0 right-0 top-[64px] z-20 border-b border-cyan-300/20 bg-[#05080e]/90 px-4 py-1 text-xs text-cyan-100/85">
          {stickySymbol}
        </div>
      ) : null}

      <div className={`grid min-h-0 flex-1 ${showMinimap ? "grid-cols-[1fr_78px]" : "grid-cols-[1fr]"}`}>
        <div className="min-w-0">
          <CodeMirror
            value={activeFile.content}
            height="100%"
            theme="dark"
            extensions={extensions}
            onCreateEditor={(editorView) => {
              viewRef.current = editorView;
              const scroller = editorView.scrollDOM;
              const measure = () => {
                setScrollTop(scroller.scrollTop);
                setScrollHeight(scroller.scrollHeight || 1);
                setClientHeight(scroller.clientHeight || 1);
                setLineHeight(editorView.defaultLineHeight || 20);
              };
              measure();
              scroller.addEventListener("scroll", measure, { passive: true });
            }}
            onChange={(next) => onContentChange(activeFile.id, next)}
            onUpdate={(vu) => {
              const scroller = vu.view.scrollDOM;
              setScrollTop(scroller.scrollTop);
              setScrollHeight(scroller.scrollHeight || 1);
              setClientHeight(scroller.clientHeight || 1);
              setLineHeight(vu.view.defaultLineHeight || 20);

              const main = vu.state.selection.main;
              const line = vu.state.doc.lineAt(main.head);
              setCursorLine(line.number);
              setCursorCol(main.head - line.from + 1);

              if (vu.selectionSet && onSelectionChange) {
                onSelectionChange(activeFile.id, main.anchor, main.head);
              }
            }}
          />
        </div>

        {showMinimap ? (
          <aside className="relative border-l border-white/10 bg-white/[0.02]">
            <button
              type="button"
              className="absolute inset-0 z-10 cursor-pointer"
              onClick={(event) => {
                const view = viewRef.current;
                if (!view) return;
                const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1);
                const nextScroll = (scrollHeight - clientHeight) * Math.max(0, Math.min(1, ratio));
                view.scrollDOM.scrollTop = nextScroll;
              }}
              aria-label="Jump in minimap"
            />

            <div className="absolute inset-0 overflow-hidden px-2 py-1">
              {minimapRows.map((row) => (
                <div
                  key={row.id}
                  className="mb-[2px] h-[2px] rounded"
                  style={{ width: `${row.width}%`, opacity: row.alpha, background: "#8fbfff" }}
                />
              ))}
            </div>

            <div
              className="pointer-events-none absolute left-[5px] right-[5px] rounded border border-cyan-300/60 bg-cyan-300/15"
              style={{
                top: `${minimapViewportTop}%`,
                height: `${Math.max(7, minimapViewportHeight)}%`,
              }}
            />
          </aside>
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#070b12]/90 px-3 py-1 text-[11px] text-slate-300">
        <div className="flex items-center gap-3">
          <span>
            Ln {cursorLine}, Col {cursorCol}
          </span>
          <span>{lineCount} lines</span>
          <span>{charCount} chars</span>
        </div>
        <div className="text-slate-400">Nexus Editor · CodeMirror 6</div>
      </footer>
    </section>
  );
}

