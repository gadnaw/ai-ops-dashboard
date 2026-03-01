/**
 * Prompt variable extraction and interpolation utilities.
 *
 * Variables are denoted with double curly braces: {{variable_name}}
 * Variable names must start with a letter or underscore and contain
 * only alphanumeric characters and underscores.
 */

/**
 * Extract all unique variable names from a prompt template string.
 * Returns them sorted alphabetically.
 *
 * @example
 * extractVariables("Hello {{name}}, your score is {{score}}!")
 * // => ["name", "score"]
 */
export function extractVariables(content: string): string[] {
  const regex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const variables = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    variables.add(match[1]!);
  }
  return Array.from(variables).sort();
}

/**
 * Interpolate variables into a prompt template string.
 * Missing variables are left as-is (e.g. {{missing}} stays {{missing}}).
 *
 * @example
 * interpolateVariables("Hello {{name}}!", { name: "World" })
 * // => "Hello World!"
 *
 * interpolateVariables("Hello {{name}}!", {})
 * // => "Hello {{name}}!"
 */
export function interpolateVariables(content: string, values: Record<string, string>): string {
  return content.replace(
    /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
    (_, key: string) => values[key] ?? `{{${key}}}`
  );
}
