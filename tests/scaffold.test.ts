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
      expect(project).toContain("## Example input / output");
      expect(project).toContain("Example 1: drops duplicates");
      expect(project).toContain("**Input**");
      expect(project).toContain("**Output**");
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

  it("creates a multi-file project-mode assignment", async () => {
    await withTempDir(async (dir) => {
      const result = await scaffold(
        {
          mode: "project",
          title: "Webhook Dedup Service",
          scenario: "A billing service receives duplicate webhook deliveries and must drop them.",
          pattern: "hash set",
          language: "typescript",
          task: "Implement `dedupe` in `src/service.ts`.",
          runCommand: "node --experimental-strip-types src/cli.ts",
          files: [
            {
              path: "src/service.ts",
              content:
                "export function dedupe(ids: string[]): string[] {\n  // TODO: implement\n  throw new Error('TODO');\n}\n",
            },
            {
              path: "src/cli.ts",
              content:
                "import { readFileSync } from 'node:fs';\nimport { dedupe } from './service';\nconst ids = JSON.parse(readFileSync(0, 'utf8'));\nprocess.stdout.write(JSON.stringify(dedupe(ids)));\n",
            },
          ],
          publicTests: [{ name: "drops dupes", input: ["a", "a", "b"], expected: ["a", "b"] }],
          hiddenTests: [{ name: "order", input: ["b", "a", "b"], expected: ["b", "a"] }],
        },
        { directory: dir },
      );

      expect(result.mode).toBe("project");
      for (const file of ["src/service.ts", "src/cli.ts", "tests/runner.mjs", "harness.json"]) {
        expect(result.files).toContain(file);
      }
      expect(result.files).not.toContain("src/solution.ts");
      const harness = JSON.parse(await readFile(path.join(result.outDir, "harness.json"), "utf8"));
      expect(harness.run).toContain("src/cli.ts");
      const task = await readFile(path.join(result.outDir, "PROJECT.md"), "utf8");
      expect(task).toContain("src/service.ts");
    });
  });

  it("creates an HTTP project with a server harness", async () => {
    await withTempDir(async (dir) => {
      const result = await scaffold(
        {
          mode: "project",
          stack: "express",
          title: "Events API",
          scenario: "Expose an endpoint that dedupes incoming events.",
          pattern: "hash set",
          language: "typescript",
          startCommand: "node --experimental-strip-types src/server.ts",
          port: 4123,
          healthPath: "/health",
          files: [{ path: "src/server.ts", content: "// TODO\n" }],
          publicTests: [
            {
              name: "dedupes",
              method: "POST",
              path: "/events",
              input: { ids: ["a", "a", "b"] },
              expected: ["a", "b"],
              status: 200,
            },
          ],
          hiddenTests: [],
        },
        { directory: dir },
      );

      expect(result.kind).toBe("http");
      const harness = JSON.parse(await readFile(path.join(result.outDir, "harness.json"), "utf8"));
      expect(harness.kind).toBe("http");
      expect(harness.start).toContain("src/server.ts");
      expect(harness.port).toBe(4123);
      expect(harness.run).toBeNull();
      const cases = JSON.parse(
        await readFile(path.join(result.outDir, "tests/public/cases.json"), "utf8"),
      );
      expect(cases[0].method).toBe("POST");
    });
  });

  it("rejects project mode for non-project languages and missing pieces", async () => {
    await withTempDir(async (dir) => {
      await expect(
        scaffold(
          {
            mode: "project",
            title: "X",
            scenario: "y",
            pattern: "z",
            language: "go",
            files: [{ path: "main.go", content: "package main" }],
            runCommand: "go run .",
          },
          { directory: dir },
        ),
      ).rejects.toThrow(/only supported/i);

      await expect(
        scaffold(
          { mode: "project", title: "X", scenario: "y", pattern: "z", language: "typescript" },
          { directory: dir },
        ),
      ).rejects.toThrow(/requires a `files`/);
    });
  });
});
