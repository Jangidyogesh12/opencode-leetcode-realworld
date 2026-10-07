import path from "node:path";
import { type Plugin, tool } from "@opencode-ai/plugin";
import { collectPathReferences, isGuardedTool, isProtectedReference } from "./guard";
import { fetchProblem, renderProblemForAgent } from "./leetcode";
import { PRACTICE_DESCRIPTION, PRACTICE_TEMPLATE } from "./prompt";
import { scaffold } from "./scaffold";
import type { ScaffoldSpec } from "./types";

const testCaseSchema = tool.schema.object({
  name: tool.schema.string().describe("Short description of what the case asserts"),
  input: tool.schema.any().describe("The single JSON-shaped payload passed to the entry function"),
  expected: tool.schema.any().describe("The JSON-shaped value the entry function must return"),
});

export const LeetCodeRealWorld: Plugin = async ({ client, directory }) => {
  const log = async (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    extra?: Record<string, unknown>,
  ) => {
    try {
      await client.app.log({
        body: { service: "leetcode-realworld", level, message, extra },
      });
    } catch {
      /* logging must never break a session */
    }
  };

  const fetchTool = tool({
    description:
      "Fetch a LeetCode problem (random, by id/slug, the daily challenge, or filtered by difficulty/tags). " +
      "Use the returned algorithmic principle to design a real-world assignment. Never surface the raw problem to the learner.",
    args: {
      mode: tool.schema
        .enum(["random", "specific", "daily", "filter"])
        .default("random")
        .describe("How to choose the problem"),
      idOrSlug: tool.schema.string().optional().describe("Problem id or slug (required for mode=specific)"),
      difficulty: tool.schema.enum(["Easy", "Medium", "Hard"]).optional(),
      tags: tool.schema.array(tool.schema.string()).optional().describe("Topic tags, e.g. ['graph']"),
    },
    async execute(args, context) {
      const problem = await fetchProblem({
        mode: args.mode,
        idOrSlug: args.idOrSlug,
        difficulty: args.difficulty,
        tags: args.tags,
        signal: context.abort,
      });
      context.metadata({ title: `${problem.title} (${problem.difficulty})` });
      await log("info", "Fetched problem", { slug: problem.slug, difficulty: problem.difficulty });
      const metadata = {
        id: problem.frontendId || problem.id,
        slug: problem.slug,
        title: problem.title,
        difficulty: problem.difficulty,
        topics: problem.topics,
        url: problem.url,
      };
      return `${renderProblemForAgent(problem)}\n\n<!-- source-metadata ${JSON.stringify(
        metadata,
      )} -->`;
    },
  });

  const scaffoldTool = tool({
    description:
      "Create a real-world practice project from a spec (scenario, requirements, starter, tests). " +
      "Rejects any spec that leaks the original problem, its title, slug, or a coding-practice site name.",
    args: {
      title: tool.schema.string().describe("Real-world project title (no coding-practice words)"),
      scenario: tool.schema.string().describe("Business context, written like a real ticket"),
      pattern: tool.schema.string().describe("Underlying algorithmic principle (internal only)"),
      projectName: tool.schema.string().optional().describe("kebab-case directory name"),
      difficulty: tool.schema.string().optional(),
      language: tool.schema
        .enum([
          "typescript",
          "javascript",
          "python",
          "ruby",
          "php",
          "go",
          "rust",
          "csharp",
          "swift",
        ])
        .default("typescript")
        .describe("Target language for the practice project"),
      functionName: tool.schema.string().optional().describe("Entry function name (default: solve)"),
      requirements: tool.schema.array(tool.schema.string()).default([]).describe("Testable requirements"),
      edgeCases: tool.schema.array(tool.schema.string()).default([]),
      starterCode: tool.schema.string().optional().describe("Optional starter implementation"),
      publicTests: tool.schema.array(testCaseSchema).default([]).describe("Visible test cases"),
      hiddenTests: tool.schema.array(testCaseSchema).default([]).describe("Extra acceptance test cases"),
      outDir: tool.schema.string().optional().describe("Target directory, relative to the session directory"),
      sourceSlug: tool.schema.string().optional().describe("Provenance only; never surfaced"),
      sourceTitle: tool.schema.string().optional().describe("Provenance only; never surfaced"),
    },
    async execute(rawArgs, context) {
      const spec = rawArgs as ScaffoldSpec;
      const result = await scaffold(spec, { directory: context.directory });
      context.metadata({ title: result.title });

      const relative = path.relative(context.directory, result.outDir) || ".";
      await log("info", "Scaffolded practice project", {
        outDir: relative,
        language: result.language,
        files: result.files.length,
      });
      try {
        await client.tui.showToast({
          body: {
            title: "Practice project ready",
            message: `${result.title} -> ${relative}`,
            variant: "success",
            duration: 5000,
          },
        });
      } catch {
        /* toast is best-effort */
      }

      return [
        `Created a real-world practice project at ${relative}`,
        "",
        `Title: ${result.title}`,
        `Language: ${result.languageName} (${result.runtime})`,
        `Files (${result.files.length}):`,
        ...result.files.map((file) => `  - ${file}`),
        "",
        `Check your work with: ${result.checkCommand}`,
        "The solution is intentionally left unimplemented. Do not write it for the learner.",
      ].join("\n");
    },
  });

  return {
    config: async (config) => {
      const commands = (config.command ??= {});
      if (!commands.practice) {
        commands.practice = {
          template: PRACTICE_TEMPLATE,
          description: PRACTICE_DESCRIPTION,
        };
      }
    },

    tool: {
      leetcode_fetch: fetchTool,
      leetcode_scaffold: scaffoldTool,
    },

    "tool.execute.before": async (input, output) => {
      if (!isGuardedTool(input.tool)) return;
      const args = (output.args ?? {}) as Record<string, unknown>;
      const reference = collectPathReferences(input.tool, args).find(isProtectedReference);
      if (reference) {
        throw new Error(
          `[leetcode-realworld] "${reference}" is protected practice material and cannot be accessed. ` +
            "Hidden acceptance tests and problem provenance are off-limits so the exercise stays honest.",
        );
      }
    },

    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await log("debug", "Session idle", { cwd: directory });
      }
    },
  };
};
