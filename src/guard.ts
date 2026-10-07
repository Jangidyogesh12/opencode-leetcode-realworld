/**
 * The generated oracle tests and provenance file are the only things keeping the
 * practice exercise honest. If the learner (or a helpful agent) can just read the
 * hidden tests or the `.practice-meta.json` that points back to the original
 * problem, the exercise collapses into "solve the LeetCode problem".
 *
 * These helpers detect tool calls that would touch those files so the plugin can
 * block them.
 */

const GUARDED_TOOLS = new Set([
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "list",
  "find",
  "bash",
]);

const HIDDEN_SEGMENT = /(^|[\/\s"'])tests\/hidden(\/|[\s"']|$)/;
const META_FILE = /(^|[\/\s"'])\.practice-meta\.json/;
const LEGACY_META = /(^|[\/\s"'])\.practice\/meta\.json/;

export function normalizeReference(value: string): string {
  return value.replace(/\\/g, "/");
}

export function isProtectedReference(value: string): boolean {
  const normalized = normalizeReference(value);
  return HIDDEN_SEGMENT.test(normalized) || META_FILE.test(normalized) || LEGACY_META.test(normalized);
}

export function isGuardedTool(toolName: string): boolean {
  return GUARDED_TOOLS.has(toolName);
}

/**
 * Pull the path-like arguments out of a tool call. Deliberately conservative:
 * we only inspect fields that name a file, directory, or shell command, so we
 * never false-positive on prose or search patterns.
 */
export function collectPathReferences(toolName: string, args: Record<string, unknown>): string[] {
  const references: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && value.length > 0) references.push(value);
  };

  add(args.filePath);
  add(args.path);
  add(args.pattern);
  add(args.command);
  add(args.include);

  if (toolName === "bash" && typeof args.command === "string") {
    references.push(args.command);
  }

  return references;
}
