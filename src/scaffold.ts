import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLanguage, normalizeLanguage, type LanguageContext } from "./languages";
import { assertNoLeak } from "./patterns";
import { schemaFromSamples } from "./schema";
import type { FileEntry, LanguageId, ScaffoldResult, ScaffoldSpec, TestCase } from "./types";

function kebab(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function camel(input: string): string {
  const parts = kebab(input).split("-").filter(Boolean);
  return parts
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

interface ResolvedNames {
  projectName: string;
  functionName: string;
  title: string;
}

function resolveNames(spec: ScaffoldSpec): ResolvedNames {
  const projectName = kebab(spec.projectName ?? spec.title) || "practice-project";
  const functionName = spec.functionName?.trim() || "solve";
  return { projectName, functionName, title: spec.title };
}

function json(value: unknown, indent = 2): string {
  return JSON.stringify(value, null, indent);
}

const RUNNER = String.raw`#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testsDir, "..");
const harness = JSON.parse(readFileSync(path.join(root, "harness.json"), "utf8"));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}

function same(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function runCase(input) {
  const result = spawnSync(harness.run, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    input: JSON.stringify(input),
    timeout: 30000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim().split("\n").slice(-6).join("\n");
    throw new Error("process exited with code " + result.status + (detail ? "\n" + detail : ""));
  }
  const text = (result.stdout || "").trim();
  return text === "" ? null : JSON.parse(text);
}

if (harness.build) {
  const build = spawnSync(harness.build, { cwd: root, shell: true, stdio: "inherit" });
  if (build.status !== 0) {
    console.error("\nBuild failed.");
    process.exit(1);
  }
}

const onlyPublic = process.argv.includes("--public");
const suites = onlyPublic ? ["public"] : ["public", "hidden"];
let passed = 0;
let failed = 0;

for (const suite of suites) {
  const cases = JSON.parse(readFileSync(path.join(root, "tests", suite, "cases.json"), "utf8"));
  console.log("\n" + suite + " (" + cases.length + " cases)");
  for (const testCase of cases) {
    try {
      const received = runCase(testCase.input);
      if (same(received, testCase.expected)) {
        passed += 1;
        console.log("  PASS  " + testCase.name);
      } else {
        failed += 1;
        console.log("  FAIL  " + testCase.name);
        console.log("        expected: " + JSON.stringify(testCase.expected));
        console.log("        received: " + JSON.stringify(received));
      }
    } catch (error) {
      failed += 1;
      console.log("  ERROR " + testCase.name);
      for (const line of String(error.message).split("\n")) {
        console.log("        " + line);
      }
    }
  }
}

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
`;

function requirementsSection(spec: ScaffoldSpec): string {
  const requirements = spec.requirements ?? [];
  if (requirements.length === 0) return "";
  return `## Requirements\n\n${requirements.map((req, i) => `${i + 1}. ${req}`).join("\n")}\n`;
}

function edgeCaseSection(spec: ScaffoldSpec): string {
  const edgeCases = spec.edgeCases ?? [];
  if (edgeCases.length === 0) return "";
  return `## Edge cases to handle\n\n${edgeCases.map((edge) => `- ${edge}`).join("\n")}\n`;
}

function exampleSection(spec: ScaffoldSpec): string {
  const tests = spec.publicTests ?? [];
  if (tests.length === 0) return "";
  const blocks = tests.slice(0, 3).map((test, index) => {
    const input = json(test.input);
    const output = json(test.expected);
    return `### Example ${index + 1}: ${test.name}

**Input**

\`\`\`json
${input}
\`\`\`

**Output**

\`\`\`json
${output}
\`\`\``;
  });
  return `## Example input / output\n\nUse these to derive the logic.\n\n${blocks.join("\n\n")}\n`;
}

function readmeFor(names: ResolvedNames, spec: ScaffoldSpec, language: LanguageId): string {
  const adapter = getLanguage(language);
  const source = `src/solution.${adapter.extension}`;
  const publicCount = (spec.publicTests ?? []).length;
  const hiddenCount = (spec.hiddenTests ?? []).length;
  return `# ${names.title}

${names.title} is a self-contained engineering exercise. Read \`PROJECT.md\` for the
brief, implement the entry point in \`${source}\`, and make the test suite pass.

## Run the tests

\`\`\`bash
node tests/runner.mjs
\`\`\`

Requires ${adapter.runtime}.

- \`node tests/runner.mjs --public\` runs only the visible cases.
- Your program reads **one JSON value on stdin** and writes **one JSON value on
  stdout**. The starter file shows the exact shape.

## Layout

\`\`\`
${source}                     # implement your solution here
tests/public/cases.json        # ${publicCount} visible cases
tests/hidden/cases.json        # ${hiddenCount} acceptance cases (do not edit)
tests/runner.mjs               # test harness
harness.json                   # build/run commands
PROJECT.md                     # scenario, requirements, definition of done
\`\`\`

Prefer clarity over cleverness: the goal is production-quality code, not the
shortest possible snippet.
`;
}

function projectDoc(spec: ScaffoldSpec, names: ResolvedNames, language: LanguageId): string {
  const adapter = getLanguage(language);
  return `# ${names.title}

## Scenario

${spec.scenario.trim()}

${exampleSection(spec)}
${requirementsSection(spec)}
${edgeCaseSection(spec)}
## Interface

Implement \`src/solution.${adapter.extension}\`. Your program is invoked once per test
case: it reads **one JSON value from stdin** and must write **one JSON value to
stdout**. Nothing else may be printed to stdout (use stderr for debugging).

## Definition of done

- The full test suite passes: \`node tests/runner.mjs\`.
- Edge cases above are handled, not just the happy path.
- No network or external services are required.
`;
}

const PROJECT_GITIGNORE = `# build artifacts
out/
target/
bin/
obj/
node_modules/
__pycache__/
*.pyc
.pytest_cache/

# acceptance tests + provenance stay local
tests/hidden/
.practice-meta.json
`;

function metaFor(spec: ScaffoldSpec, names: ResolvedNames, language: LanguageId): string {
  return (
    json({
      title: names.title,
      functionName: names.functionName,
      language,
      pattern: spec.pattern,
      difficulty: spec.difficulty ?? null,
      source: { slug: spec.sourceSlug ?? null, title: spec.sourceTitle ?? null },
      generatedAt: new Date().toISOString(),
    }) + "\n"
  );
}

function casesFile(cases: TestCase[]): string {
  return json(cases) + "\n";
}

function buildFiles(spec: ScaffoldSpec, names: ResolvedNames, language: LanguageId): FileEntry[] {
  const adapter = getLanguage(language);
  const cases = [...(spec.publicTests ?? []), ...(spec.hiddenTests ?? [])];
  const first = cases[0];
  const ctx: LanguageContext = {
    projectName: names.projectName,
    functionName: names.functionName,
    title: names.title,
    input: schemaFromSamples(cases.map((test) => test.input)),
    output: schemaFromSamples(cases.map((test) => test.expected)),
    inputExample: first?.input ?? null,
    outputExample: first?.expected ?? null,
  };

  const files: FileEntry[] = [
    { relative: "README.md", contents: readmeFor(names, spec, language) },
    { relative: "PROJECT.md", contents: projectDoc(spec, names, language) },
    { relative: ".gitignore", contents: PROJECT_GITIGNORE },
    { relative: ".practice-meta.json", contents: metaFor(spec, names, language) },
    {
      relative: "harness.json",
      contents:
        json({ build: adapter.build(ctx), run: adapter.run(ctx) }) + "\n",
    },
    { relative: "tests/runner.mjs", contents: RUNNER },
    { relative: "tests/public/cases.json", contents: casesFile(spec.publicTests ?? []) },
    { relative: "tests/hidden/cases.json", contents: casesFile(spec.hiddenTests ?? []) },
    {
      relative: `src/solution.${adapter.extension}`,
      contents: spec.starterCode?.trimEnd()
        ? spec.starterCode.trimEnd() + "\n"
        : adapter.starter(ctx),
    },
  ];

  files.push(...adapter.files(ctx));
  return files;
}

export interface ScaffoldOptions {
  /** Base directory to resolve relative paths against (the session directory). */
  directory: string;
}

export async function scaffold(
  spec: ScaffoldSpec,
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const language = normalizeLanguage(spec.language) ?? (spec.language ? undefined : "typescript");
  if (!language) {
    throw new Error(
      `Unsupported language "${spec.language}". Supported: typescript, javascript, python, ruby, php, go, rust, csharp, swift.`,
    );
  }

  const normalized: ScaffoldSpec = {
    ...spec,
    language,
    requirements: spec.requirements ?? [],
    edgeCases: spec.edgeCases ?? [],
    publicTests: spec.publicTests ?? [],
    hiddenTests: spec.hiddenTests ?? [],
  };

  assertNoLeak(normalized);

  const adapter = getLanguage(language);
  const names = resolveNames(normalized);
  const target = normalized.outDir
    ? path.resolve(options.directory, normalized.outDir)
    : path.resolve(options.directory, ".practice", names.projectName);

  const files = buildFiles(normalized, names, language);
  for (const file of files) {
    const destination = path.join(target, file.relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.contents, "utf8");
  }

  const check = "node tests/runner.mjs";
  return {
    outDir: target,
    title: names.title,
    language,
    languageName: adapter.name,
    runtime: adapter.runtime,
    files: files.map((file) => file.relative).sort(),
    runCommand: check,
    checkCommand: check,
  };
}

export { resolveNames, kebab, camel };
