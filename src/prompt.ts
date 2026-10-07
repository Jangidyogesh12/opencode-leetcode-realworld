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
- tags: comma-separated topic tags, e.g. "dynamic-programming,graph"
- a specific problem id or slug, e.g. "two-sum" or "1"
- language: a supported language name or alias (below)

## 2. Ask when unclear (use the \`question\` tool)
Supported languages: ${SUPPORTED_LANGUAGES.join(", ")}.

- If the user did NOT specify a language, call the \`question\` tool and ask which
  language they want to practice, offering these as options:
  ${SUPPORTED_LANGUAGES.map((name) => `"${name}"`).join(", ")}.
- If the user did NOT specify a difficulty, include a second question in the SAME
  \`question\` call offering "Easy", "Medium" (recommended), and "Hard".
- Wait for the answers. Do not guess and do not default silently.

If the user did specify values, skip the corresponding question. Only ask at all
when something is missing.

## 3. Fetch the source problem (private)
Call the \`leetcode_fetch\` tool with the difficulty/tags/slug. The fetched
statement is for YOUR reasoning only. Never paste it, paraphrase it closely, or
name its source anywhere in the generated project.

## 4. Derive the principle
Identify the underlying algorithmic idea (e.g. sliding window, heap-based
scheduling, union-find, DP over intervals). Do not carry over the problem's
fiction (arrays of "nums", "target", etc.).

## 5. Invent a real engineering scenario
Design a plausible product/business task that genuinely needs that principle. Good
domains: observability pipelines, payments/ledgering, logistics, rate limiting,
access control, search, feature flags, data reconciliation, scheduling.
The scenario must read like a ticket from a real team: who needs it, why, and what
"correct" means.

The assignment has ONE entry point with a JSON-in / JSON-out contract:
- It receives a single JSON value (usually an object describing a request).
- It returns a single JSON value (a response or result).
This is how real services, CLIs and jobs exchange data, and it lets the same test
harness verify any language.

Call the tool \`leetcode_scaffold\` with a spec containing:
- title: real-world project title (no coding-practice words)
- scenario: 1-3 paragraphs of business context
- pattern: the underlying principle (internal only)
- language: the language the user chose (use the canonical id, e.g. "typescript",
  "javascript", "python", "ruby", "php", "go", "rust", "csharp", "swift")
- requirements: concrete, testable bullet points
- edgeCases: tricky situations the solution must handle
- starterCode: optional; otherwise a TODO stub is generated
- publicTests: 5-8 visible cases that illustrate the contract
- hiddenTests: 6-12 acceptance cases, including edge cases, boundary values, an
  empty/degenerate input, and at least one larger input
- sourceSlug / sourceTitle: for internal provenance ONLY (never surfaced)

Test cases must be JSON-serialisable: \`{ "name": string, "input": any, "expected": any }\`.
Make sure every \`expected\` value is actually correct for the described rules, and
that public and hidden cases do not overlap.

## 6. Rules (non-negotiable)
- The generated title, scenario, requirements, comments, and test names MUST NOT
  mention LeetCode, its title, its slug, or any coding-practice site. The
  \`leetcode_scaffold\` tool will reject the spec if it does.
- DO NOT implement the solution. Your job ends when the scaffold is written. The
  learner implements the solution file themselves.
- Do not reveal the fetched problem or the original examples.
- If the tool reports a leak, rewrite the offending fields and retry.

## 7. After scaffolding
Report back with, in order:
1. One short paragraph describing the assignment as a real task (no source spoilers).
2. The project path and chosen language.
3. The exact command to run the tests (\`node tests/runner.mjs\`).
4. Note that \`tests/hidden/cases.json\` holds extra acceptance cases they should not edit.
Then stop. If the learner asks for help, give guiding hints and ask questions
rather than writing the algorithm for them.
`;

export function practiceTemplate(): string {
  return PRACTICE_TEMPLATE;
}
