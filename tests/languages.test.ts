import { describe, expect, it } from "bun:test";
import { getLanguage, languageIds, normalizeLanguage, type LanguageContext } from "../src/languages";
import { schemaFromSamples } from "../src/schema";

const ctx: LanguageContext = {
  projectName: "demo-project",
  functionName: "solve",
  title: "Demo",
  input: schemaFromSamples([{ amounts: [2, 7], target: 9 }]),
  output: schemaFromSamples([[0, 1]]),
  inputExample: { amounts: [2, 7], target: 9 },
  outputExample: [0, 1],
};

describe("languages", () => {
  it("normalizes names and aliases", () => {
    expect(normalizeLanguage("ts")).toBe("typescript");
    expect(normalizeLanguage("TypeScript")).toBe("typescript");
    expect(normalizeLanguage("py")).toBe("python");
    expect(normalizeLanguage("python3")).toBe("python");
    expect(normalizeLanguage("golang")).toBe("go");
    expect(normalizeLanguage("rb")).toBe("ruby");
    expect(normalizeLanguage("cs")).toBe("csharp");
    expect(normalizeLanguage("dotnet")).toBe("csharp");
    expect(normalizeLanguage("swift")).toBe("swift");
    expect(normalizeLanguage("cobol")).toBeUndefined();
    expect(normalizeLanguage(undefined)).toBeUndefined();
  });

  it("exposes nine languages, each with a starter and a run command", () => {
    const ids = languageIds();
    expect(ids).toHaveLength(9);
    for (const id of ids) {
      const adapter = getLanguage(id);
      expect(adapter.extension.length).toBeGreaterThan(0);
      expect(adapter.run(ctx).length).toBeGreaterThan(0);
      const starter = adapter.starter(ctx);
      expect(starter).toContain("solve");
      // The starter must read stdin and fail loudly until implemented.
      expect(starter.toLowerCase()).toContain("not implemented");
    }
  });

  it("generates static types for type-safe languages", () => {
    expect(getLanguage("typescript").starter(ctx)).toContain("interface Payload");
    expect(getLanguage("typescript").starter(ctx)).toContain("amounts: number[]");
    expect(getLanguage("go").starter(ctx)).toContain("type Payload struct");
    expect(getLanguage("go").starter(ctx)).toContain("json:\"amounts\"");
    expect(getLanguage("rust").starter(ctx)).toContain("struct Payload");
    expect(getLanguage("rust").starter(ctx)).toContain("amounts: Vec<i64>");
    expect(getLanguage("csharp").starter(ctx)).toContain("class Payload");
    expect(getLanguage("swift").starter(ctx)).toContain("struct Payload: Codable");
  });

  it("documents the input/output format for dynamic languages", () => {
    for (const id of ["javascript", "python", "ruby", "php"] as const) {
      const starter = getLanguage(id).starter(ctx);
      expect(starter).toContain("Input format:");
      expect(starter).toContain("Output format:");
      expect(starter).toContain("amounts");
    }
  });

  it("falls back to a format comment for Swift when the schema is dynamic", () => {
    const dynamic: LanguageContext = {
      ...ctx,
      input: schemaFromSamples([{ anything: null }]),
    };
    const starter = getLanguage("swift").starter(dynamic);
    expect(starter).toContain("// Input format:");
    expect(starter).toContain("JSONSerialization");
  });
});
