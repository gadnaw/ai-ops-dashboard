// src/components/prompts/PromptEditor.tsx
"use client";

import dynamic from "next/dynamic";

// Dynamic import with ssr:false is REQUIRED for CodeMirror.
// CodeMirror accesses browser globals (window, document) at import time.
// Even useEffect wrapping is insufficient — the import itself causes SSR crashes.
const CodeMirrorEditorInner = dynamic(
  () => import("./CodeMirrorEditorInner").then((mod) => mod.CodeMirrorEditorInner),
  {
    ssr: false,
    // Loading fallback prevents CLS — matches the editor height
    loading: () => (
      <div className="h-[280px] w-full rounded-md border border-gray-700 bg-[#1a1a2e] p-3 font-mono text-sm text-gray-400">
        Loading editor...
      </div>
    ),
  }
);

export function PromptEditor({
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
    <div className="overflow-hidden rounded-md border border-gray-700">
      <CodeMirrorEditorInner
        value={value}
        {...(onChange ? { onChange } : {})}
        readOnly={readOnly}
        height={height}
      />
    </div>
  );
}
