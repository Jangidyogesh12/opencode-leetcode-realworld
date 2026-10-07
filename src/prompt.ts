export const PRACTICE_DESCRIPTION =
  "Turn a LeetCode problem into a realistic software-engineering assignment (scenario, starter, tests) so you practice applying the underlying algorithm, not solving the puzzle.";

export const SUPPORTED_LANGUAGES = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Ruby",
  "PHP",
  "Go",
  "Rust",
  "C#",
  "Swift",
];

/** Languages that can receive a full multi-file project. */
export const PROJECT_LANGUAGES = ["TypeScript", "Python", "Rust"];

/** Stacks offered in project mode. */
export const STACKS = [
  "Vanilla (no framework)",
  "Express API (Node)",
  "Next.js (React)",
  "FastAPI (Python)",
  "Agent decides",
];

/**
 * The `/practice` command prompt. It orchestrates the two plugin tools and is
 * deliberately opinionated: the whole value of this plugin is that the learner
 * never sees the original puzzle.
 */
export const PRACTICE_TEMPLATE = `You are running the "LeetCode -> Real World" practice generator.

Goal: fetch a LeetCode problem, extract the *algorithmic principle* behind it, and
produce a realistic software-engineering assignment that requires the same
principle. The learner must solve a genuine engineering task, never the original
puzzle.

## 1. Parse arguments
Arguments: "$ARGUMENTS"
Recognise any of these (all optional):
- difficulty: easy | medium | hard
- tags: topic names or slugs, e.g. "graph" or "dynamic-programming,sliding-window"
- a specific problem id or slug, e.g. "two-sum" or "1"
- language: a supported language name or alias (below)
- scope: "single" | "mini" | "full"
- stack: a stack name, e.g. "express", "nextjs", "fastapi", "vanilla"

Mapping rules:
- A word that names a topic (array, string, graph, tree, dp/dynamic-programming,
  sliding-window, two-pointers, greedy, ...) is a TAG. Pass it to \`leetcode_fetch\`
  as \`tags\` (array of slugs).
- Only pass \`idOrSlug\` for a number or known slug (e.g. "1", "two-sum").
- When a tag is given it MUST be respected; if the fetched topics lack it, retry.

## 2. Ask how they want to start (use the \`question\` tool)

Step A — if language and/or difficulty are missing, ask in one \`question\` call.
Languages: ${SUPPORTED_LANGUAGES.join(", ")}. Difficulty options: "Easy",
"Medium" (recommended), "Hard".

Step B — scope. Full projects are only for ${PROJECT_LANGUAGES.join(", ")}.
- If the language is one of those AND scope was not given, ask a SECOND question
  "How do you want to start?" with: "Quick exercise" (one function),
  "Mini project" (~3-6 files), "Fuller project" (~6-15 files).
- Otherwise skip it.

Step C — stack. Only when the scope is a project (not "Quick exercise"):
- If the stack was not given, ask a THIRD \`question\`: "Which stack?" with:
  ${STACKS.map((s) => `"${s}"`).join(", ")}.
- Pick sensible stacks: Express/Next.js for TypeScript, FastAPI for Python,
  "Vanilla" or an HTTP service for Rust.

Wait for answers. Do not guess.

## 3. Fetch the source problem (private)
Call \`leetcode_fetch\` with the difficulty, passing topics as \`tags\`. Verify the
returned topics include every requested tag; retry if not. The statement is for
YOUR reasoning only — never paste it or name its source anywhere.

## 4. Derive the principle
Identify the underlying algorithmic idea. Do not carry over the problem's fiction.

## 5. Build the assignment
When the spec is ready, call the \`leetcode_scaffold\` tool. The two shapes differ:

### A) scope = Quick exercise  -> mode "single"
One entry point, JSON-in / JSON-out. Do NOT provide \`starterCode\` (the plugin
generates typed/documented starters from your test cases). Spec: mode, title,
scenario, pattern, difficulty, language, requirements, edgeCases, publicTests
(5-8), hiddenTests (6-12), sourceSlug, sourceTitle.

### B) scope = Mini/Fuller project  -> mode "project" (${PROJECT_LANGUAGES.join(", ")})
Build a REAL app in the chosen stack. The folder structure is entirely up to you
— it is fluid, there is no template. The learner must implement ONE marked TODO
that contains the algorithm; the rest must build and run.

Design:
- Create a genuine feature the algorithm powers (an endpoint, command, job, or
  module), embedded in a believable app with a few real layers (entry, routing or
  CLI, domain/service, models/types, small helpers). Respect the size: mini ~3-6
  files, fuller ~6-15 files.
- Leave exactly one \`TODO\` where the algorithm goes. It must be the ONLY thing
  missing. Everything else compiles/runs.
- Choose the interface based on the stack:

  * Web/API stacks (Express, Next.js, FastAPI, any HTTP server): provide
    \`startCommand\`, \`port\`, \`healthPath\` (a route that returns 200), and use
    **HTTP test cases**. Every case is: { name, method, path, input (JSON body),
    expected (JSON response body), status? }. Add install/build commands as needed
    (\`installCommand\`, e.g. "npm install" / "python -m pip install -r requirements.txt";
    \`buildCommand\` only if a build is required). The runner starts the server,
    polls the health path, then sends the requests.
  * Non-web stacks (CLI/library): provide \`runCommand\` (reads ONE JSON value on
    stdin, writes ONE JSON value on stdout) and use stdio cases
    { name, input, expected }.

- Include everything needed to build/run you write as \`files\` (manifests, config,
  source). No hidden dependencies beyond \`installCommand\`.
- Import/runtime correctness:
  - TypeScript under Node ESM type-stripping: relative imports MUST include the
    \`.ts\` extension (\`import { x } from "./service.ts"\`). If you use a bundler/dev
    server (Next.js), follow that stack's conventions instead.
  - Python: make imports work when the entry runs as given by \`startCommand\`/\`runCommand\`.
  - Rust: internal modules via \`mod ...;\` under \`src/\`.
- Provide \`task\`: a short markdown brief naming the file(s) and function/route to implement.
- Do NOT implement the TODO and do not reveal the algorithm in comments or commit messages.

Both shapes:
- requirements / edgeCases: concrete and testable
- publicTests (5-8) and hiddenTests (6-12) as JSON-serialisable objects. Every
  \`expected\` must be correct; public and hidden must not overlap. Include an
  empty/degenerate case and a larger case.
- \`sourceSlug\` / \`sourceTitle\`: provenance ONLY, never surfaced.

## 6. Rules (non-negotiable)
- Titles, scenarios, requirements, comments, file contents and test names MUST NOT
  mention LeetCode, its title, its slug, or any coding-practice site. The tool
  rejects leaks, including inside \`files\`.
- NEVER implement the algorithm (single: leave the entry unimplemented; project:
  leave the TODO unimplemented).
- Do not reveal the fetched problem or the original examples.

## 7. After scaffolding
Report back with, in order:
1. One short paragraph describing the assignment as a real task (no spoilers).
2. The project path, mode, stack, and language.
3. The exact command to run the tests (\`node tests/runner.mjs\`).
4. For project mode: the file(s) and function/route holding the TODO.
5. Note that \`tests/hidden/cases.json\` holds extra acceptance cases they should not edit.
Then stop. If the learner asks for help, give guiding hints and ask questions
rather than writing the algorithm for them.
`;

export function practiceTemplate(): string {
  return PRACTICE_TEMPLATE;
}
