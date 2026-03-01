import { describe, it, expect } from "vitest";
import { extractVariables, interpolateVariables } from "@/lib/prompts/variables";

// =============================================================================
// extractVariables
// =============================================================================

describe("extractVariables", () => {
  it("extracts a single variable", () => {
    expect(extractVariables("Hello {{name}}!")).toEqual(["name"]);
  });

  it("extracts multiple unique variables sorted alphabetically", () => {
    expect(extractVariables("{{city}}, {{age}}, {{name}}")).toEqual(["age", "city", "name"]);
  });

  it("deduplicates repeated variables", () => {
    expect(extractVariables("{{foo}} and {{foo}} again")).toEqual(["foo"]);
  });

  it("returns empty array for content with no variables", () => {
    expect(extractVariables("No variables here.")).toEqual([]);
  });

  it("supports underscore-prefixed variable names", () => {
    expect(extractVariables("Value: {{_private}}")).toEqual(["_private"]);
  });

  it("supports alphanumeric variable names with underscores", () => {
    expect(extractVariables("{{user_name_1}} {{item2}}")).toEqual(["item2", "user_name_1"]);
  });

  it("does NOT extract invalid variable names starting with a digit", () => {
    // {{1invalid}} should not match — names must start with letter or underscore
    expect(extractVariables("{{1invalid}} {{valid}}")).toEqual(["valid"]);
  });

  it("handles multiline content", () => {
    const content = `System: You are a {{role}}.
User: My name is {{name}}.
Context: {{context}}`;
    expect(extractVariables(content)).toEqual(["context", "name", "role"]);
  });

  it("returns empty array for empty string", () => {
    expect(extractVariables("")).toEqual([]);
  });

  it("ignores malformed braces like {single} or {{{triple}}}", () => {
    // Single braces should not match
    // Triple braces: {{triple}} is a match because {{...}} matches inside
    expect(extractVariables("{single} {{double}} triple")).toEqual(["double"]);
  });
});

// =============================================================================
// interpolateVariables
// =============================================================================

describe("interpolateVariables", () => {
  it("replaces a single variable", () => {
    expect(interpolateVariables("Hello {{name}}!", { name: "World" })).toBe("Hello World!");
  });

  it("replaces multiple variables", () => {
    const result = interpolateVariables("Dear {{title}} {{last_name}}, your score is {{score}}.", {
      title: "Dr",
      last_name: "Smith",
      score: "95",
    });
    expect(result).toBe("Dear Dr Smith, your score is 95.");
  });

  it("leaves missing variables as-is", () => {
    expect(interpolateVariables("Hello {{name}}, age {{age}}!", { name: "Alice" })).toBe(
      "Hello Alice, age {{age}}!"
    );
  });

  it("returns original content unchanged when values map is empty", () => {
    expect(interpolateVariables("{{a}} {{b}}", {})).toBe("{{a}} {{b}}");
  });

  it("handles content with no variables", () => {
    expect(interpolateVariables("No vars here.", { x: "1" })).toBe("No vars here.");
  });

  it("handles empty string content", () => {
    expect(interpolateVariables("", { x: "1" })).toBe("");
  });

  it("replaces the same variable multiple times", () => {
    expect(interpolateVariables("{{x}} and {{x}} and {{x}}", { x: "42" })).toBe("42 and 42 and 42");
  });

  it("does not partially replace nested-looking braces", () => {
    // {{{name}}} — the outer brace is literal, inner {{name}} is replaced
    expect(interpolateVariables("{{{name}}}", { name: "test" })).toBe("{test}");
  });

  it("handles special characters in replacement values", () => {
    const result = interpolateVariables("Path: {{path}}", {
      path: "C:\\Users\\admin",
    });
    expect(result).toBe("Path: C:\\Users\\admin");
  });

  it("handles newlines and whitespace in content", () => {
    const template = "Line 1: {{a}}\nLine 2: {{b}}";
    expect(interpolateVariables(template, { a: "hello", b: "world" })).toBe(
      "Line 1: hello\nLine 2: world"
    );
  });
});
