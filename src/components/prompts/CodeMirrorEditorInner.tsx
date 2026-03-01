// src/components/prompts/CodeMirrorEditorInner.tsx
// DO NOT import this file directly. Import PromptEditor.tsx instead.
// All CodeMirror imports must remain here (browser-API dependent).
"use client";

import CodeMirror from "@uiw/react-codemirror";
import { EditorView, ViewPlugin, Decoration, type DecorationSet } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

// Custom ViewPlugin: highlights {{variableName}} with amber color
const variableDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      // Match {{variableName}} — same regex as extractVariables()
      const regex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

      for (const { from, to } of view.visibleRanges) {
        const text = view.state.sliceDoc(from, to);
        let match: RegExpExecArray | null;
        let lastIndex = 0;
        regex.lastIndex = 0; // Reset regex state for each visible range

        while ((match = regex.exec(text)) !== null) {
          const start = from + match.index;
          const end = start + match[0].length;
          if (start >= lastIndex) {
            builder.add(start, end, Decoration.mark({ class: "cm-template-variable" }));
            lastIndex = end;
          }
        }
      }

      return builder.finish();
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

// Theme: amber color for {{variable}} marks
const variableTheme = EditorView.baseTheme({
  ".cm-template-variable": {
    color: "#f59e0b", // amber-400 — matches Tailwind amber-400
    fontWeight: "600",
    borderRadius: "2px",
  },
});

export function CodeMirrorEditorInner({
  value,
  onChange,
  readOnly = false,
  height = "280px",
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
}) {
  return (
    <CodeMirror
      value={value}
      height={height}
      theme="dark"
      extensions={[
        variableDecorationPlugin,
        variableTheme,
        EditorView.lineWrapping,
        ...(readOnly ? [EditorView.editable.of(false)] : []),
      ]}
      {...(onChange ? { onChange } : {})}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: !readOnly,
        bracketMatching: false,
        autocompletion: false,
      }}
    />
  );
}
