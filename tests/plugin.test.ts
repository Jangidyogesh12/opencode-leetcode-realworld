import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LeetCodeRealWorld } from "../src/index";

const TWO_SUM = {
  questionId: "1",
  questionFrontendId: "1",
  title: "Two Sum",
  titleSlug: "two-sum",
  difficulty: "Easy",
  content:
    "<p>Given an array of integers <code>nums</code> and an integer <code>target</code>, return indices.</p>",
  topicTags: [{ name: "Array" }, { name: "Hash Table" }],
  hints: ["Use a hash map"],
  stats: '{"acRate": "58.0%"}',
  url: "https://leetcode.com/problems/two-sum/",
};

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(TWO_SUM), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockPluginInput(directory: string) {
  return {
    client: {
      app: { log: async () => true },
      tui: { showToast: async () => true },
    },
    project: {},
    directory,
    worktree: directory,
    serverUrl: new URL("http://localhost:0"),
    $: Bun.$,
  } as never;
}

function toolContext(directory: string) {
  return {
    sessionID: "session",
    messageID: "message",
    agent: "build",
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => undefined,
    ask: async () => undefined,
  };
}

describe("LeetCodeRealWorld plugin", () => {
  it("registers the two tools and the /practice command", async () => {
    const hooks = await LeetCodeRealWorld(mockPluginInput(process.cwd()));
    expect(Object.keys(hooks.tool ?? {}).sort()).toEqual(["leetcode_fetch", "leetcode_scaffold"]);

    const config: Record<string, any> = {};
    await hooks.config?.(config);
    expect(config.command.practice.template).toContain("leetcode_fetch");
    expect(config.command.practice.template).toContain("leetcode_scaffold");
  });

  it("fetches a problem and scaffolds a project through the tools", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "plugin-"));
    try {
      const hooks = await LeetCodeRealWorld(mockPluginInput(dir));
      const ctx = toolContext(dir);

      const fetched = await hooks.tool!.leetcode_fetch!.execute(
        { mode: "specific", idOrSlug: "two-sum" },
        ctx as never,
      );
      expect(fetched).toContain("Two Sum");
      expect(fetched).toContain("source-metadata");

      const result = await hooks.tool!.leetcode_scaffold!.execute(
        {
          title: "Order Matching Engine",
          scenario: "A brokerage must pair buy and sell orders that settle to the same value.",
          pattern: "hash table",
          language: "typescript",
          functionName: "match",
          requirements: ["Return the indices of the first matching pair"],
          publicTests: [{ name: "matches a pair", input: [2, 7, 11, 15], expected: [0, 1] }],
          hiddenTests: [{ name: "handles negatives", input: [-3, 4, 3, 90], expected: [0, 2] }],
          sourceSlug: "two-sum",
          sourceTitle: "Two Sum",
        },
        ctx as never,
      );
      expect(result).toContain("Created a real-world practice project");

      const meta = await readFile(path.join(dir, ".practice", "order-matching-engine", ".practice-meta.json"), "utf8");
      expect(meta).toContain("two-sum");
      const readme = await readFile(path.join(dir, ".practice", "order-matching-engine", "README.md"), "utf8");
      expect(readme.toLowerCase()).not.toContain("leetcode");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks access to hidden tests and provenance metadata", async () => {
    const hooks = await LeetCodeRealWorld(mockPluginInput(process.cwd()));
    const guard = hooks["tool.execute.before"]!;

    await expect(
      guard({ tool: "read", sessionID: "s", callID: "c" }, { args: { filePath: "x/tests/hidden/a.test.ts" } }),
    ).rejects.toThrow();

    await expect(
      guard({ tool: "bash", sessionID: "s", callID: "c" }, { args: { command: "cat .practice-meta.json" } }),
    ).rejects.toThrow();

    await expect(
      guard({ tool: "read", sessionID: "s", callID: "c" }, { args: { filePath: "src/matcher.ts" } }),
    ).resolves.toBeUndefined();
  });
});
