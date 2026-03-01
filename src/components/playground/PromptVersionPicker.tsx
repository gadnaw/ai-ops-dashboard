"use client";

import { useState } from "react";

type PromptVersion = {
  id: string;
  version: number;
  content: string;
  systemPrompt: string | null;
  variables: unknown; // JSON — cast to string[]
};

type PromptTemplate = {
  id: string;
  slug: string;
  name: string;
  activeVersionId: string | null;
  versions: PromptVersion[];
};

interface PromptVersionPickerProps {
  templates: PromptTemplate[];
  /** Called when the user selects a version */
  onVersionSelect: (version: PromptVersion | null) => void;
  /** Pre-selected version ID (from URL query param) */
  initialVersionId?: string | undefined;
}

export function PromptVersionPicker({
  templates,
  onVersionSelect,
  initialVersionId,
}: PromptVersionPickerProps) {
  // Find initial template + version from initialVersionId
  const findInitialState = () => {
    if (!initialVersionId) return { templateId: "", versionId: "" };
    for (const t of templates) {
      const v = t.versions.find((ver) => ver.id === initialVersionId);
      if (v) return { templateId: t.id, versionId: v.id };
    }
    return { templateId: "", versionId: "" };
  };

  const initial = findInitialState();
  const [selectedTemplateId, setSelectedTemplateId] = useState(initial.templateId);
  const [selectedVersionId, setSelectedVersionId] = useState(initial.versionId);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const selectedVersion =
    selectedTemplate?.versions.find((v) => v.id === selectedVersionId) ?? null;

  // Notify parent whenever version changes
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);

    // Auto-select active version of new template
    const template = templates.find((t) => t.id === templateId);
    if (template?.activeVersionId) {
      const activeVersion =
        template.versions.find((v) => v.id === template.activeVersionId) ?? null;
      setSelectedVersionId(template.activeVersionId);
      onVersionSelect(activeVersion);
    } else if (template?.versions[0]) {
      setSelectedVersionId(template.versions[0].id);
      onVersionSelect(template.versions[0]);
    } else {
      setSelectedVersionId("");
      onVersionSelect(null);
    }
  };

  const handleVersionChange = (versionId: string) => {
    setSelectedVersionId(versionId);
    const version = selectedTemplate?.versions.find((v) => v.id === versionId) ?? null;
    onVersionSelect(version);
  };

  return (
    <div className="space-y-3">
      {/* Template selector */}
      <div>
        <label className="mb-1 block text-xs text-gray-400">Prompt Template</label>
        <select
          value={selectedTemplateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
        >
          <option value="">— No template (free-form prompt) —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Version selector — shown only when template is selected */}
      {selectedTemplate && selectedTemplate.versions.length > 0 && (
        <div>
          <label className="mb-1 block text-xs text-gray-400">Version</label>
          <select
            value={selectedVersionId}
            onChange={(e) => handleVersionChange(e.target.value)}
            className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            {selectedTemplate.versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version}
                {v.id === selectedTemplate.activeVersionId ? " (active)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Variable count indicator */}
      {selectedVersion &&
        Array.isArray(selectedVersion.variables) &&
        selectedVersion.variables.length > 0 && (
          <p className="text-xs text-amber-500/80">
            {selectedVersion.variables.length} variable
            {selectedVersion.variables.length !== 1 ? "s" : ""} detected:{" "}
            {(selectedVersion.variables as string[]).map((v) => `{{${v}}}`).join(", ")}
          </p>
        )}
    </div>
  );
}
