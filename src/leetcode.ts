import type { CodeSnippet, NormalizedProblem } from "./types";

const DEFAULT_BASE_URL = "https://leetcode-api-pied.vercel.app";

export function apiBaseUrl(): string {
  return (process.env.LEETCODE_API_BASE ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export interface FetchOptions {
  /** How to choose the problem. Defaults to `random`. */
  mode?: "random" | "specific" | "daily" | "filter";
  /** Required when `mode` is `specific`. Accepts an id ("1") or a slug ("two-sum"). */
  idOrSlug?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  tags?: string[];
  signal?: AbortSignal;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      signal,
      headers: { accept: "application/json", "user-agent": "opencode-leetcode-realworld" },
    });
  } catch (error) {
    throw new Error(`Failed to reach LeetCode API at ${url}: ${(error as Error).message}`);
  }
  if (!res.ok) {
    throw new Error(`LeetCode API responded ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}

function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<sup>\s*([^<]*)\s*<\/sup>/gi, "^$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|pre|li|ul|ol|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSnippets(raw: unknown): CodeSnippet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const record = entry as Record<string, unknown>;
      return {
        lang: String(record.lang ?? record.langSlug ?? ""),
        langSlug: String(record.langSlug ?? record.langsSlug ?? record.lang ?? ""),
        code: String(record.code ?? ""),
      };
    })
    .filter((snippet) => snippet.code.length > 0);
}

function normalizeTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const record = entry as Record<string, unknown>;
      return String(record.name ?? record.slug ?? "");
    })
    .filter((name) => name.length > 0);
}

function extractAcRate(raw: Record<string, unknown>): number | undefined {
  if (typeof raw.acRate === "number") return raw.acRate;
  if (typeof raw.stats === "string") {
    try {
      const parsed = JSON.parse(raw.stats) as { acRate?: string | number };
      if (parsed.acRate !== undefined) return Number.parseFloat(String(parsed.acRate));
    } catch {
      /* ignore malformed stats */
    }
  }
  return undefined;
}

export function normalizeProblem(
  raw: Record<string, unknown>,
  fallbackSlug?: string,
): NormalizedProblem {
  const nested = (raw.question ?? {}) as Record<string, unknown>;
  const contentHtml = String(raw.content ?? nested.content ?? "");
  const slug = String(
    raw.titleSlug ?? raw.title_slug ?? raw.slug ?? nested.titleSlug ?? fallbackSlug ?? "",
  );
  const acRate = extractAcRate(raw);
  return {
    id: String(raw.questionId ?? nested.questionId ?? raw.id ?? ""),
    frontendId: String(
      raw.questionFrontendId ?? nested.questionFrontendId ?? raw.frontend_id ?? "",
    ),
    slug,
    title: String(raw.title ?? nested.title ?? ""),
    difficulty: String(raw.difficulty ?? nested.difficulty ?? "Unknown"),
    url: String(raw.url ?? (slug ? `https://leetcode.com/problems/${slug}/` : "")),
    topics: normalizeTopics(raw.topicTags ?? nested.topicTags),
    contentHtml,
    contentText: htmlToText(contentHtml),
    hints: Array.isArray(raw.hints)
      ? raw.hints.map((hint) => htmlToText(String(hint)))
      : [],
    snippets: normalizeSnippets(raw.codeSnippets ?? nested.codeSnippets),
    acRate,
    paidOnly: Boolean(raw.isPaidOnly ?? raw.paid_only ?? nested.isPaidOnly ?? false),
    date: typeof raw.date === "string" ? raw.date : undefined,
  };
}

function preferredSlug(idOrSlug: string | undefined): string | undefined {
  if (!idOrSlug) return undefined;
  return /^\d+$/.test(idOrSlug.trim()) ? undefined : idOrSlug.trim();
}

/**
 * A problem is usable for practice generation only if it is free and actually
 * carries a statement. The API returns `content: null` (with `isPaidOnly: true`)
 * for premium problems.
 */
export function isUsableProblem(problem: NormalizedProblem): boolean {
  return !problem.paidOnly && problem.contentText.trim().length > 40;
}

async function pickUsable(
  make: () => Promise<NormalizedProblem>,
  attempts = 6,
): Promise<NormalizedProblem> {
  let last: NormalizedProblem | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = await make();
    last = candidate;
    if (isUsableProblem(candidate)) return candidate;
  }
  if (!last) throw new Error("LeetCode API returned no problems.");
  return last;
}

export async function getProblem(idOrSlug: string, signal?: AbortSignal): Promise<NormalizedProblem> {
  const raw = await getJson<Record<string, unknown>>(
    `/problem/${encodeURIComponent(idOrSlug)}`,
    signal,
  );
  return normalizeProblem(raw, preferredSlug(idOrSlug));
}

interface RandomProblem {
  title_slug?: string;
  titleSlug?: string;
}

export async function getRandom(
  opts: { difficulty?: string; tags?: string[]; signal?: AbortSignal } = {},
): Promise<NormalizedProblem> {
  const params = new URLSearchParams();
  if (opts.difficulty) params.set("difficulty", opts.difficulty);
  if (opts.tags?.length) params.set("tags", opts.tags.join(","));
  const query = params.toString();
  const raw = await getJson<RandomProblem>(`/random${query ? `?${query}` : ""}`, opts.signal);
  const slug = raw.title_slug ?? raw.titleSlug;
  if (!slug) throw new Error("LeetCode API /random did not return a problem slug.");
  return getProblem(slug, opts.signal);
}

export async function getDaily(signal?: AbortSignal): Promise<NormalizedProblem> {
  const raw = await getJson<Record<string, unknown>>("/daily", signal);
  return normalizeProblem(raw);
}

interface FilterResponse {
  problems?: Array<Record<string, unknown>>;
}

export async function getFiltered(
  opts: { difficulty?: string; tags?: string[]; limit?: number; signal?: AbortSignal } = {},
): Promise<NormalizedProblem> {
  const params = new URLSearchParams();
  if (opts.difficulty) params.set("difficulty", opts.difficulty);
  if (opts.tags?.length) params.set("tags", opts.tags.join(","));
  params.set("limit", String(opts.limit ?? 20));
  const raw = await getJson<FilterResponse>(`/problems/filter?${params.toString()}`, opts.signal);
  const candidates = raw.problems ?? [];
  if (candidates.length === 0) throw new Error("LeetCode API returned no problems for the given filter.");
  const choice = candidates[Math.floor(Math.random() * candidates.length)] as Record<string, unknown>;
  const slug = String(choice.title_slug ?? choice.titleSlug ?? "");
  if (!slug) throw new Error("Filtered problem is missing a slug.");
  return getProblem(slug, opts.signal);
}

export async function fetchProblem(options: FetchOptions = {}): Promise<NormalizedProblem> {
  const mode = options.mode ?? "random";
  switch (mode) {
    case "specific": {
      if (!options.idOrSlug) throw new Error("`idOrSlug` is required when mode is `specific`.");
      return getProblem(options.idOrSlug, options.signal);
    }
    case "daily": {
      const daily = await getDaily(options.signal);
      if (isUsableProblem(daily)) return daily;
      return pickUsable(() =>
        getRandom({ difficulty: options.difficulty, tags: options.tags, signal: options.signal }),
      );
    }
    case "filter":
      return pickUsable(() =>
        getFiltered({
          difficulty: options.difficulty,
          tags: options.tags,
          signal: options.signal,
        }),
      );
    case "random":
    default:
      return pickUsable(() =>
        getRandom({ difficulty: options.difficulty, tags: options.tags, signal: options.signal }),
      );
  }
}

export interface TagInfo {
  name: string;
  slug: string;
  problem_count: number;
}

export async function getTags(signal?: AbortSignal): Promise<TagInfo[]> {
  return getJson<TagInfo[]>("/tags", signal);
}

/** Render a compact, agent-friendly view of the problem. Never write this to disk. */
export function renderProblemForAgent(problem: NormalizedProblem): string {
  const lines: string[] = [];
  lines.push(`# ${problem.title} (${problem.difficulty})`);
  if (problem.topics.length) lines.push(`Topics: ${problem.topics.join(", ")}`);
  if (problem.acRate !== undefined) lines.push(`Acceptance: ${problem.acRate}%`);
  lines.push("");
  lines.push(problem.contentText || "(no statement returned)");
  if (problem.hints.length) {
    lines.push("");
    lines.push("## Hints (do not reveal verbatim)");
    for (const hint of problem.hints) lines.push(`- ${hint}`);
  }
  return lines.join("\n");
}
