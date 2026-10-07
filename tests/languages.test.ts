import { describe, expect, it } from "bun:test";
import { getLanguage, languageIds, normalizeLanguage } from "../src/languages";

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
    const ctx = { projectName: "demo-project", functionName: "solve", title: "Demo" };
    for (const id of ids) {
      const adapter = getLanguage(id);
      expect(adapter.extension.length).toBeGreaterThan(0);
      expect(adapter.run(ctx).length).toBeGreaterThan(0);
      const starter = adapter.starter(ctx);
      expect(starter).toContain("solve");
      // The starter must read stdin and it must fail loudly until implemented.
      expect(starter.toLowerCase()).toContain("not implemented");
    }
  });
});
