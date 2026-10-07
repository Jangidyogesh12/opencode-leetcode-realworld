import path from "node:path";
import { type Plugin, tool } from "@opencode-ai/plugin";
import { collectPathReferences, isGuardedTool, isProtectedReference } from "./guard";
import { fetchProblem, renderProblemForAgent } from "./leetcode";
import { PRACTICE_DESCRIPTION, PRACTICE_TEMPLATE } from "./prompt";
import { scaffold } from "./scaffold";
import type { ScaffoldSpec } from "./types";

const testCaseSchema = tool.schema.object({
  name: tool.schema.string().describe("Short description of what the case asserts"),
  input: tool.schema.any().optional().describe("stdio: JSON payload. http: JSON request body."),
  expected: tool.schema.any().optional().describe("Expected JSON result/response body"),
  method: tool.schema.string().optional().describe("http: method, e.g. POST (default GET)"),
  path: tool.schema.string().optional().describe("http: request path, e.g. /api/events"),
  status: tool.schema.number().optional().describe("http: expected status code (default 200)"),
  headers: tool.schema
    .record(tool.schema.string(), tool.schema.string())
    .optional()
    .describe("http: extra request headers"),
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
      tags: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe(
          "Topic tag slugs to constrain the problem, e.g. ['array'] or ['dynamic-programming']",
        ),
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
      "Create a real-world practice project from a spec. " +
      "Use mode \"single\" for one JSON-in/out function (any language) or mode \"project\" " +
      "(typescript, python, rust) for a multi-file app where one TODO must be implemented. " +
      "Rejects any spec that leaks the original problem, its title, slug, or a coding-practice site name.",
    args: {
      mode: tool.schema
        .enum(["single", "project"])
        .default("single")
        .describe("single = one function; project = multi-file app (ts/python/rust)"),
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
      task: tool.schema
        .string()
        .optional()
        .describe("Project mode: markdown brief telling the learner what to implement and where"),
      files: tool.schema
        .array(tool.schema.object({ path: tool.schema.string(), content: tool.schema.string() }))
        .optional()
        .describe("Project mode: the full file tree, leaving one TODO to implement"),
      runCommand: tool.schema
        .string()
        .optional()
        .describe("stdio project: command that runs one case (JSON on stdin, JSON on stdout)"),
      buildCommand: tool.schema
        .string()
        .optional()
        .describe("Project mode: optional one-time build command (e.g. `cargo build`)"),
      installCommand: tool.schema
        .string()
        .optional()
        .describe("Project mode: optional one-time install command (e.g. `npm install`)"),
      startCommand: tool.schema
        .string()
        .optional()
        .describe("http project: command that starts the server (enables HTTP test mode)"),
      port: tool.schema.number().optional().describe("http project: server port (default 3000)"),
      healthPath: tool.schema
        .string()
        .optional()
        .describe("http project: readiness path the runner polls (default /)"),
      stack: tool.schema
        .string()
        .optional()
        .describe("Free-form stack label, e.g. express, nextjs, fastapi, vanilla"),
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
        `Mode: ${result.mode}${result.mode === "project" ? ` (${result.kind}${result.stack ? `, ${result.stack}` : ""})` : ""}`,
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
