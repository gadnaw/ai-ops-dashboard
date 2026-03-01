type RubricDimension = {
  id: string;
  name: string;
  description: string;
  weight: number;
  anchors: Record<string, string>;
};

/**
 * Convert JSONB rubric dimensions to judge system prompt text.
 * Called before invoking judgeRequest() to build the rubric section of the prompt.
 */
export function buildRubricText(rubric: { dimensions: unknown }): string {
  const dimensions = rubric.dimensions as RubricDimension[];

  return dimensions
    .map((d) => {
      const anchors = Object.entries(d.anchors)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([score, desc]) => `  ${score}: ${desc}`)
        .join("\n");
      return `${d.name.toUpperCase()} — ${d.description} (weight: ${Math.round(d.weight * 100)}%)\n${anchors}`;
    })
    .join("\n\n");
}
