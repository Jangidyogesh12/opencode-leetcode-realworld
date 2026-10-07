import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../src/scaffold";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "practice-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const baseSpec = {
  title: "Realtime Dedup Pipeline",
  scenario: "A payments service needs to drop duplicate events while preserving arrival order.",
  pattern: "hash table",
  requirements: ["Return the first occurrence of each event id"],
  edgeCases: ["Empty input returns an empty result"],
  publicTests: [{ name: "drops duplicates", input: [1, 1, 2], expected: [1, 2] }],
  hiddenTests: [{ name: "preserves order", input: [2, 2, 1], expected: [2, 1] }],
  sourceSlug: "two-sum",
  sourceTitle: "Two Sum",
};

describe("scaffold", () => {
  it("creates a TypeScript project and keeps the source private", async () => {
    await withTempDir(async (dir) => {
      const result = await scaffold({ ...baseSpec, language: "typescript" }, { directory: dir });

      for (const file of [
        "src/solution.ts",
        "tests/runner.mjs",
        "tests/public/cases.json",
        "tests/hidden/cases.json",
        "harness.json",
        "package.json",
        "README.md",
        "PROJECT.md",
      ]) {
        expect(result.files).toContain(file);
      }
      expect(existsSync(path.join(result.outDir, "package.json"))).toBe(true);

      const meta = await readFile(path.join(result.outDir, ".practice-meta.json"), "utf8");
      expect(meta).toContain("two-sum");

      const publicCases = JSON.parse(
        await readFile(path.join(result.outDir, "tests/public/cases.json"), "utf8"),
      );
      expect(publicCases).toHaveLength(1);
      const hiddenCases = JSON.parse(
        await readFile(path.join(result.outDir, "tests/hidden/cases.json"), "utf8"),
      );
      expect(hiddenCases[0].name).toBe("preserves order");

      const readme = await readFile(path.join(result.outDir, "README.md"), "utf8");
      const project = await readFile(path.join(result.outDir, "PROJECT.md"), "utf8");
      for (const visible of [readme, project]) {
        const lowered = visible.toLowerCase();
        expect(lowered).not.toContain("leetcode");
        expect(lowered).not.toContain("two sum");
        expect(lowered).not.toContain("two-sum");
      }
    });
  });

  it("creates a Python project without a package.json", async () => {
    await withTempDir(async (dir) => {
      const result = await scaffold({ ...baseSpec, language: "python" }, { directory: dir });
      expect(result.files).toContain("src/solution.py");
      expect(result.files).not.toContain("package.json");
      const harness = JSON.parse(await readFile(path.join(result.outDir, "harness.json"), "utf8"));
      expect(harness.run).toContain("python3");
      const source = await readFile(path.join(result.outDir, "src/solution.py"), "utf8");
      expect(source).toContain("def solve(payload)");
    });
  });

  it("accepts aliases like 'js'", async () => {
    await withTempDir(async (dir) => {
      const result = await scaffold({ ...baseSpec, language: "js" as never }, { directory: dir });
      expect(result.languageName).toBe("JavaScript");
      expect(result.files).toContain("src/solution.mjs");
    });
  });

  it("rejects a spec that leaks the source problem", async () => {
    await withTempDir(async (dir) => {
      await expect(
        scaffold(
          {
            title: "Two Sum Variant",
            scenario: "Use the two-sum approach to match orders.",
            pattern: "hash table",
            language: "typescript",
            sourceTitle: "Two Sum",
            sourceSlug: "two-sum",
          },
          { directory: dir },
        ),
      ).rejects.toThrow();
    });
  });

  it("rejects an unsupported language", async () => {
    await withTempDir(async (dir) => {
      await expect(
        scaffold({ ...baseSpec, language: "cobol" as never }, { directory: dir }),
      ).rejects.toThrow(/Unsupported language/);
    });
  });
});
