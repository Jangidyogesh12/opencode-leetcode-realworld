import type { ScaffoldSpec } from "./types";

/**
 * Deterministic fallback inspiration. Maps a normalized topic tag to plausible
 * real-world domains that exercise the same underlying principle. The agent is
 * free to invent better scenarios; this exists so a sensible seed is always
 * available even with a weak model.
 */
export const DOMAIN_SEEDS: Record<string, string[]> = {
  array: ["batch audit-log processor", "telemetry windowing service"],
  string: ["log sanitizer", "template renderer"],
  "hash-table": ["event deduplication pipeline", "feature-flag lookup cache"],
  "two-pointers": ["order-book matching engine", "sorted log-stream merger"],
  "sliding-window": ["API rate limiter", "rolling p95 latency tracker"],
  "binary-search": ["price-threshold alert engine", "pagination cursor resolver"],
  "binary-search-tree": ["in-memory index range scanner", "time-series retention policy"],
  "heap-priority-queue": ["background job scheduler", "incident severity triage"],
  "priority-queue": ["background job scheduler", "incident severity triage"],
  "dynamic-programming": ["delivery route cost optimizer", "budget allocation planner"],
  greedy: ["resource bin-packing scheduler", "ad-slot allocator"],
  graph: ["microservice dependency resolver", "network topology mapper"],
  "depth-first-search": ["permission inheritance resolver", "nested category walker"],
  "breadth-first-search": ["service-mesh shortest-path router", "org-chart traversal"],
  "union-find": ["account clustering for fraud rings", "network segment merger"],
  trie: ["autocomplete search index", "routing prefix matcher"],
  stack: ["config-rule expression evaluator", "undo/redo command stack"],
  queue: ["async task pipeline", "event buffer"],
  "monotonic-stack": ["stock-span style sidebar calculator", "histogram-based capacity planner"],
  sorting: ["leaderboard ranker", "changelog assembly job"],
  backtracking: ["deployment permutation explorer", "seat-assignment planner"],
  "bit-manipulation": ["feature-flag bitmask service", "compact permission encoder"],
  math: ["billing proration engine", "metrics aggregation service"],
  design: ["in-memory key-value store", "rate-limited API gateway"],
  "linked-list": ["LRU eviction chain", "streaming ring buffer"],
  tree: ["filesystem index builder", "org hierarchy aggregator"],
  "prefix-sum": ["rolling revenue aggregator", "subnet traffic accounting"],
  "segment-tree": ["range-quota enforcement service", "metrics rollup store"],
  database: ["analytics reconciliation job", "query result differ"],
  simulation: ["tick-based match engine", "capacity planning simulator"],
  "ordered-set": ["leaderboard with rank lookup", "scheduler keyed by priority"],
  "topological-sort": ["build-order planner", "migration dependency sequencer"],
};

/** Tags that are too generic to drive a scenario on their own. */
const WEAK_TAGS = new Set(["algorithms", "database", "math"]);

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function domainSeedsFor(topics: string[]): string[] {
  const seeds: string[] = [];
  for (const topic of topics) {
    const key = normalizeTag(topic);
    const matches = DOMAIN_SEEDS[key];
    if (matches && !WEAK_TAGS.has(key)) seeds.push(...matches);
  }
  if (seeds.length === 0) {
    seeds.push("internal developer-tooling service", "operations workflow automation");
  }
  return Array.from(new Set(seeds));
}

export function pickDomainSeed(topics: string[], random: () => number = Math.random): string {
  const seeds = domainSeedsFor(topics);
  return seeds[Math.floor(random() * seeds.length)] ?? seeds[0]!;
}

const GENERIC_BANNED_TERMS = [
  "leetcode",
  "leet code",
  "geeksforgeeks",
  "hackerrank",
  "codewars",
  "neetcode",
  "blind 75",
  "grind 75",
];

export interface LeakReport {
  term: string;
  field: string;
}

function textsFromSpec(spec: ScaffoldSpec): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  const push = (field: string, value: unknown) => {
    if (typeof value === "string" && value.length > 0) entries.push([field, value]);
  };
  push("title", spec.title);
  push("projectName", spec.projectName);
  push("scenario", spec.scenario);
  push("pattern", spec.pattern);
  push("functionName", spec.functionName);
  push("task", spec.task);
  (spec.requirements ?? []).forEach((req, i) => push(`requirements[${i}]`, req));
  (spec.edgeCases ?? []).forEach((edge, i) => push(`edgeCases[${i}]`, edge));
  (spec.publicTests ?? []).forEach((test, i) => push(`publicTests[${i}].name`, test.name));
  (spec.hiddenTests ?? []).forEach((test, i) => push(`hiddenTests[${i}].name`, test.name));
  (spec.files ?? []).forEach((file, i) => push(`files[${i}] (${file.path})`, file.content));
  return entries;
}

/**
 * Guards the core promise of the plugin: the assignment must not be the LeetCode
 * problem in disguise. Scans every learner-visible string for the source problem
 * and generic problem-site branding.
 */
export function findLeaks(spec: ScaffoldSpec): LeakReport[] {
  const lowered = spec.sourceTitle?.toLowerCase().trim();
  const sourceSlug = spec.sourceSlug?.toLowerCase().trim();
  const reports: LeakReport[] = [];

  for (const [field, value] of textsFromSpec(spec)) {
    const haystack = value.toLowerCase();
    for (const term of GENERIC_BANNED_TERMS) {
      if (haystack.includes(term)) reports.push({ term, field });
    }
    if (lowered && lowered.length > 3 && haystack.includes(lowered)) {
      reports.push({ term: `source title "${spec.sourceTitle}"`, field });
    }
    if (sourceSlug && sourceSlug.length > 2 && haystack.includes(sourceSlug)) {
      reports.push({ term: `source slug "${spec.sourceSlug}"`, field });
    }
  }

  const unique = new Map<string, LeakReport>();
  for (const report of reports) unique.set(`${report.term}::${report.field}`, report);
  return Array.from(unique.values());
}

export function assertNoLeak(spec: ScaffoldSpec): void {
  const leaks = findLeaks(spec);
  if (leaks.length === 0) return;
  const details = leaks.map((l) => `  - "${l.term}" in ${l.field}`).join("\n");
  throw new Error(
    "The scaffold spec leaks the original problem, which breaks the whole point of this plugin.\n" +
      "Rewrite the flagged fields so the assignment stands on its own as real software work:\n" +
      `${details}\n` +
      "Never mention the problem title, its slug, or any coding-practice site.",
  );
}
