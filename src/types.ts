export type LanguageId =
  | "typescript"
  | "javascript"
  | "python"
  | "ruby"
  | "php"
  | "go"
  | "rust"
  | "csharp"
  | "swift";

export interface CodeSnippet {
  lang: string;
  langSlug: string;
  code: string;
}

/**
 * A LeetCode problem reduced to a stable, API-shape-agnostic structure.
 * The upstream API is not perfectly consistent between endpoints, so everything
 * is funneled through `normalizeProblem` before it reaches the rest of the plugin.
 */
export interface NormalizedProblem {
  id: string;
  frontendId: string;
  slug: string;
  title: string;
  difficulty: string;
  url: string;
  topics: string[];
  contentHtml: string;
  contentText: string;
  hints: string[];
  snippets: CodeSnippet[];
  acRate?: number;
  paidOnly: boolean;
  /** Only present for the `/daily` endpoint. */
  date?: string;
}

export interface TestCase {
  name: string;
  input: unknown;
  expected: unknown;
}

export interface FileEntry {
  relative: string;
  contents: string;
}

/**
 * The contract the agent fills in after it has decided on a real-world scenario.
 * None of these fields may reference LeetCode: `scaffold()` calls `assertNoLeak`
 * before writing anything to disk.
 */
export interface ScaffoldSpec {
  /** kebab-case directory name. Derived from `title` when omitted. */
  projectName?: string;
  /** Human title of the *real-world* project, e.g. "Realtime Dedup Pipeline". */
  title: string;
  /** Business context. Explains why the project matters and what it must do. */
  scenario: string;
  /** Underlying algorithmic principle, e.g. "sliding window". Internal only. */
  pattern: string;
  difficulty?: string;
  language?: LanguageId;
  /** Name of the entry function inside the solution file. Defaults to `solve`. */
  functionName?: string;
  requirements?: string[];
  edgeCases?: string[];
  /** Optional starter implementation. A TODO stub is generated when omitted. */
  starterCode?: string;
  publicTests?: TestCase[];
  hiddenTests?: TestCase[];
  /** Directory to create the project in, relative to the session directory. */
  outDir?: string;
  /** Internal provenance, stored in `.practice-meta.json` only. Never leaked. */
  sourceSlug?: string;
  sourceTitle?: string;
}

export interface ScaffoldResult {
  outDir: string;
  title: string;
  language: LanguageId;
  languageName: string;
  runtime: string;
  files: string[];
  runCommand: string;
  checkCommand: string;
}
