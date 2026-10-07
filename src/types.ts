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
  /** stdio: the JSON payload. http: the request body (ignored for GET/HEAD). */
  input?: unknown;
  /** stdio: expected result. http: expected JSON response body. */
  expected?: unknown;
  /** http only: HTTP method (default GET). */
  method?: string;
  /** http only: request path, e.g. "/api/events" (default "/"). */
  path?: string;
  /** http only: expected status code (default 200). */
  status?: number;
  /** http only: extra request headers. */
  headers?: Record<string, string>;
}

export type HarnessKind = "stdio" | "http";

export interface FileEntry {
  relative: string;
  contents: string;
}

/** A file the agent authored for a multi-file project. */
export interface ProjectFile {
  path: string;
  content: string;
}

export type PracticeMode = "single" | "project";

/**
 * The contract the agent fills in after it has decided on a real-world scenario.
 * None of these fields may reference LeetCode: `scaffold()` calls `assertNoLeak`
 * before writing anything to disk.
 */
export interface ScaffoldSpec {
  /** `single` = one JSON-in/out function. `project` = a multi-file app. */
  mode?: PracticeMode;
  /** Free-form stack label, e.g. "express", "nextjs", "fastapi", "vanilla". */
  stack?: string;
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
  /** Optional starter implementation (single mode). A TODO stub is generated when omitted. */
  starterCode?: string;
  publicTests?: TestCase[];
  hiddenTests?: TestCase[];
  /** Directory to create the project in, relative to the session directory. */
  outDir?: string;
  /** Internal provenance, stored in `.practice-meta.json` only. Never leaked. */
  sourceSlug?: string;
  sourceTitle?: string;

  // --- project mode -------------------------------------------------------
  /** The full file tree for a project-mode assignment. */
  files?: ProjectFile[];
  /** Markdown brief for the learner: what to implement and where. */
  task?: string;
  /** stdio project: command that runs one case (JSON stdin -> JSON stdout). */
  runCommand?: string;
  /** Optional one-time install command (e.g. `npm install`, `pip install -r req.txt`). */
  installCommand?: string;
  /** Optional one-time build command (e.g. `cargo build`, `npm run build`). */
  buildCommand?: string;
  /** http project: command that starts the server. */
  startCommand?: string;
  /** http project: port the server listens on (default 3000). */
  port?: number;
  /** http project: path used to poll readiness (default "/"). */
  healthPath?: string;
}

export interface ScaffoldResult {
  outDir: string;
  title: string;
  language: LanguageId;
  languageName: string;
  runtime: string;
  mode: PracticeMode;
  kind: HarnessKind;
  stack?: string;
  files: string[];
  runCommand: string;
  checkCommand: string;
}
