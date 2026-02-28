"use client";

import { history, historyKeymap, indentWithTab, defaultKeymap } from "@codemirror/commands";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";

export type NexusLanguage = "python" | "javascript" | "typescript" | "plaintext";

export type PresenceCursor = {
  id: string;
  name: string;
  color: string;
  from: number;
  to: number;
};

type PresenceCursorSpec = Omit<PresenceCursor, "from" | "to"> & {
  from: number;
  to: number;
};

const setGhostTextEffect = StateEffect.define<string>();
const setPresenceEffect = StateEffect.define<PresenceCursorSpec[]>();

class GhostTextWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "nexus-ghost-text";
    span.textContent = this.text;
    return span;
  }
}

class PresenceCaretWidget extends WidgetType {
  constructor(
    private readonly color: string,
    private readonly label: string,
  ) {
    super();
  }

  toDOM() {
    const el = document.createElement("span");
    el.className = "nexus-presence-caret";
    el.style.setProperty("--presence-color", this.color);
    el.textContent = " ";
    const name = document.createElement("span");
    name.className = "nexus-presence-label";
    name.textContent = this.label;
    name.style.setProperty("--presence-color", this.color);
    el.appendChild(name);
    return el;
  }
}

const ghostTextField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setGhostTextEffect)) {
        const ghost = effect.value.trim();
        if (!ghost) return Decoration.none;

        const pos = tr.state.selection.main.head;
        const widget = Decoration.widget({ side: 1, widget: new GhostTextWidget(ghost) }).range(pos);

        return Decoration.set([widget]);
      }
    }

    if (tr.docChanged || tr.selection) {
      return decorations.map(tr.changes);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const presenceField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setPresenceEffect)) {
        const ranges: Range<Decoration>[] = effect.value.flatMap((cursor) => {
          const from = Math.max(0, Math.min(cursor.from, tr.state.doc.length));
          const to = Math.max(from, Math.min(cursor.to, tr.state.doc.length));
          const name = cursor.name;
          const color = cursor.color || "#58a6ff";

          const mark = Decoration.mark({
            class: "nexus-presence-selection",
            attributes: { style: `--presence-color:${color}` },
          }).range(from, Math.max(from + 1, to));

          const caret = Decoration.widget({
            side: -1,
            widget: new PresenceCaretWidget(color, name),
          }).range(from);

          return [mark, caret];
        });
        return Decoration.set(ranges, true);
      }
    }

    if (tr.docChanged) return decorations.map(tr.changes);
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const nexusTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "rgba(5, 5, 5, 0.8)",
      color: "#d7e6ff",
      height: "100%",
      fontFamily:
        '"JetBrains Mono", "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: "13px",
    },
    ".cm-scroller": {
      lineHeight: "1.6",
    },
    ".cm-content, .cm-gutter": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      borderRight: "1px solid rgba(128, 162, 210, 0.2)",
      color: "rgba(173, 194, 224, 0.65)",
      backgroundColor: "rgba(8, 12, 20, 0.42)",
      backdropFilter: "blur(8px)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#78b7ff",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(88, 166, 255, 0.08)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(88, 166, 255, 0.12)",
      color: "#eaf3ff",
    },
    ".nexus-ghost-text": {
      color: "rgba(201, 214, 234, 0.42)",
      fontStyle: "italic",
      pointerEvents: "none",
      userSelect: "none",
      marginLeft: "6px",
    },
    ".nexus-presence-selection": {
      backgroundColor: "color-mix(in srgb, var(--presence-color) 22%, transparent)",
      borderBottom: "1px solid color-mix(in srgb, var(--presence-color) 75%, white 25%)",
    },
    ".nexus-presence-caret": {
      position: "relative",
      borderLeft: "2px solid var(--presence-color)",
      marginLeft: "-1px",
      height: "1.3em",
    },
    ".nexus-presence-label": {
      position: "absolute",
      top: "-1.45em",
      left: "-1px",
      whiteSpace: "nowrap",
      fontSize: "10px",
      lineHeight: "1",
      borderRadius: "6px",
      padding: "2px 6px",
      color: "#f8fbff",
      backgroundColor: "var(--presence-color)",
      boxShadow: "0 6px 14px rgba(0,0,0,0.35)",
    },
  },
  { dark: true },
);

function languageExtension(language: NexusLanguage): Extension {
  if (language === "python") return python();
  if (language === "typescript") return javascript({ typescript: true });
  if (language === "javascript") return javascript();
  return [];
}

export function buildNexusExtensions(language: NexusLanguage, ghostText?: string): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    highlightSelectionMatches(),
    highlightActiveLine(),
    keymap.of([
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...closeBracketsKeymap,
      ...searchKeymap,
      ...lintKeymap,
    ]),
    languageExtension(language),
    syntaxHighlighting(oneDarkHighlightStyle),
    nexusTheme,
    ghostTextField,
    presenceField,
    EditorView.lineWrapping,
    EditorView.updateListener.of((vu) => {
      if (ghostText !== undefined && (vu.docChanged || vu.selectionSet)) {
        vu.view.dispatch({ effects: setGhostTextEffect.of(ghostText) });
      }
    }),
  ];
}

export function updateGhostText(view: EditorView, value: string) {
  view.dispatch({ effects: setGhostTextEffect.of(value) });
}

export function updatePresenceCursors(view: EditorView, cursors: PresenceCursor[]) {
  view.dispatch({ effects: setPresenceEffect.of(cursors) });
}
