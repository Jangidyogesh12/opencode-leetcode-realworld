# opencode-leetcode-realworld

[![npm version](https://img.shields.io/npm/v/opencode-leetcode-realworld.svg)](https://www.npmjs.com/package/opencode-leetcode-realworld)

An [opencode](https://opencode.ai) plugin that turns a LeetCode problem into a
**realistic software-engineering assignment**.

Solving the puzzle and shipping the principle are different skills. This plugin
fetches a problem, extracts the *underlying algorithm*, and generates a project
that actually needs that algorithm — a scenario, requirements, a starter stub,
and a test suite. The original problem is never shown to you.

```
/practice                          # random Medium problem
/practice hard graph              # difficulty + tags
/practice two-sum                  # a specific problem
/practice medium dynamic-programming python
```

## Install

Add the plugin to your `opencode.json` and restart opencode:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-leetcode-realworld"]
}
```

That's all you have to do. **You do not run `npm install` yourself** — opencode
reads the `plugin` list on startup and installs the package automatically with
Bun (cached in `~/.cache/opencode/node_modules/`). Just naming it in the config is
enough; the plugin then registers the `/practice` command on its own.

Prefer not to edit the file by hand? Let opencode do it:

```bash
opencode plugin opencode-leetcode-realworld
```

Use the project `opencode.json` to enable it for one repo, or
`~/.config/opencode/opencode.json` to enable it everywhere.

Confirm it loaded:

```bash
opencode debug config   # look for a "practice" command
```

### Requirements

- [opencode](https://opencode.ai) 1.x
- Node.js 18+ — the test runner uses Node no matter which language you pick
- The toolchain for your chosen language (see [Supported languages](#supported-languages))

Then, in opencode:

```
/practice
```

## Usage

```
/practice [options]
```

Options can be given in any order; the command figures out which is which.

### Options

| Option | Accepted values | Default | Description |
| --- | --- | --- | --- |
| `difficulty` | `easy` \| `medium` \| `hard` | **asks you** (Medium suggested) | Difficulty of the source problem. |
| `tags` | One or more topic tags, comma-separated (e.g. `graph` or `dynamic-programming,sliding-window`) | any | Nudges which underlying algorithm and real-world domain you get. |
| `<id-or-slug>` | A problem number or slug (e.g. `1`, `two-sum`) | random | Derive the assignment from one specific source problem. |
| `language` | A supported language or alias (see below) | **asks you** | Language of the generated project and tests. |
| `scope` | `single` \| `mini` \| `full` | **asks you** | How big the assignment is (see Two modes). |

If you leave the language (or difficulty) out, opencode **asks you** with a
multiple-choice question before generating anything.

### Examples

| Command | What you get |
| --- | --- |
| `/practice` | Asks for language + difficulty, then builds a random Medium problem. |
| `/practice easy` | Asks for the language, then an Easy problem. |
| `/practice hard graph` | Hard problem tagged Graph. |
| `/practice two-sum` | Asks for the language, then builds from the Two Sum problem. |
| `/practice medium dynamic-programming python` | Medium DP problem, Python project. |
| `/practice sliding-window js` | Random sliding-window problem in JavaScript. |

### Supported languages

| Language | Aliases | Runtime needed |
| --- | --- | --- |
| TypeScript | `ts` | Node.js 22.6+ |
| JavaScript | `js`, `node` | Node.js 18+ |
| Python | `py`, `python3` | Python 3.8+ |
| Ruby | `rb` | Ruby 2.6+ |
| PHP | — | PHP 7.4+ |
| Go | `golang` | Go 1.18+ |
| Rust | `rs`, `cargo` | Rust 1.70+ (fetches `serde_json`) |
| C# | `cs`, `dotnet` | .NET 8 SDK |
| Swift | — | Swift 5.5+ |

Every language uses the same contract: implement `src/solution.<ext>`, read one
JSON value from stdin, write one JSON value to stdout. The shared runner verifies
any language identically.

### Topic tags you can practice

Any LeetCode topic tag works. Common ones and the kind of real-world scenario
they tend to produce:

| Tag | Typical generated domain |
| --- | --- |
| `array` | batch audit-log processor |
| `string` | log sanitizer |
| `hash-table` | event deduplication pipeline |
| `two-pointers` | order-book matching engine |
| `sliding-window` | API rate limiter |
| `prefix-sum` | rolling revenue aggregator |
| `binary-search` | price-threshold alert engine |
| `sorting` | leaderboard ranker |
| `heap-priority-queue` | background job scheduler |
| `monotonic-stack` | histogram-based capacity planner |
| `stack` | config-rule expression evaluator |
| `queue` | async task pipeline |
| `greedy` | resource bin-packing scheduler |
| `dynamic-programming` | delivery route cost optimizer |
| `graph` | microservice dependency resolver |
| `depth-first-search` | permission inheritance resolver |
| `breadth-first-search` | service-mesh shortest-path router |
| `union-find` | account clustering for fraud rings |
| `topological-sort` | build-order planner |
| `trie` | autocomplete search index |
| `tree` | filesystem index builder |
| `linked-list` | LRU eviction chain |
| `backtracking` | deployment permutation explorer |
| `bit-manipulation` | feature-flag bitmask service |
| `segment-tree` | range-quota enforcement service |
| `design` | in-memory key-value store |
| `database` | analytics reconciliation job |
| `simulation` | tick-based match engine |

## How it works

```
/practice
   │
   ├─ (agent)             ask you for language/difficulty, then how you want to start
   │
   ├─ leetcode_fetch      fetch a problem from the LeetCode API (private reasoning input)
   │
   ├─ (agent)             derive the principle -> invent a real-world scenario
   │
   ├─ leetcode_scaffold   write the exercises(s): one function, or a multi-file app
   │
   └─ guard hooks         block reading hidden tests + provenance, keep the exercise honest
```

## Two modes

`/practice` asks **how you want to start**, and the answer changes what gets built:

| Scope | What you get |
| --- | --- |
| **Quick exercise** | One entry point with a JSON-in / JSON-out contract (any language). |
| **Mini project** | A small multi-file app (~3-6 files) with the algorithm behind a single `TODO` (TypeScript, Python, Rust). |
| **Fuller project** | A multi-file app with more realistic layers (~6-15 files) and the same single `TODO`. |

In project mode you get a real little codebase — CLI entry or web server, domain
types, service layer, wiring — where **everything works except one `TODO`**. You
implement that piece (the algorithm) and `node tests/runner.mjs` verifies the app
end-to-end.

Project mode is available for **TypeScript, Python, Rust**; the other languages use
the quick exercise.

**Pick your stack.** In project mode it also asks for a stack:

| Stack | Shape | How it's tested |
| --- | --- | --- |
| Vanilla (no framework) | CLI / library | JSON on stdin → JSON on stdout |
| Express API (Node) | HTTP server | runner starts it and sends HTTP requests |
| Next.js (React) | route handlers / API | runner starts it and sends HTTP requests |
| FastAPI (Python) | HTTP server | runner starts it and sends HTTP requests |
| Agent decides | whatever fits | inferred from the chosen shape |

The folder structure is **not hardcoded** — the agent designs a layout that fits
the stack and problem (`files`), so it feels like a real repo, not a template.

For server projects, test cases are HTTP requests
(`{ name, method, path, input, expected, status }`); the runner runs your
`installCommand`, optional `buildCommand`, boots `startCommand`, waits on
`healthPath`, then checks each request. For CLI/library projects it stays
stdin/stdout.

The generated project looks like this:

```
.practice/<project>/
├── README.md                 # quickstart + how to run
├── PROJECT.md                # scenario, requirements, definition of done
├── harness.json              # build + run commands for the chosen language
├── src/solution.<ext>        # implement this (one JSON in, one JSON out)
├── tests/runner.mjs          # language-agnostic test harness (Node)
├── tests/public/cases.json   # visible test cases
├── tests/hidden/cases.json   # extra acceptance cases (gitignored, guarded)
└── .practice-meta.json       # provenance only (gitignored, guarded)
```

Run the checks with:

```bash
node tests/runner.mjs            # all cases
node tests/runner.mjs --public   # visible cases only
```

## Typed starters

The starter file is generated from your test cases, so the input/output contract
is explicit before you write any logic:

- **Type-safe languages** (`typescript`, `go`, `rust`, `csharp`, `swift`) get real
  type declarations inferred from the sample inputs/outputs — an interface /
  struct / class per object, with nested objects and arrays typed too — plus a
  typed function signature. Your editor autocompletes `payload.<field>`.
- **Dynamic languages** (`javascript`, `python`, `ruby`, `php`) — and Swift when a
  shape can't be expressed statically — get a commented input/output format with a
  concrete example instead.

Example (TypeScript), generated from input `{ "values": [1,2,3] }` -> output `[3,2,1]`:

```ts
interface Payload {
  values: number[];
}

function solve(payload: Payload): number[] {
  throw new Error("Not implemented: solve");
}
```

Example (Python):

```python
# Input format:  { values: number[] }
# Input example: {"values":[1,2,3]}
# Output format: number[]
# Output example: [3,2,1]

def solve(payload):
    raise NotImplementedError("Not implemented: solve")
```

## Running from source

For plugin development, clone the repo and open opencode inside it — files under
`.opencode/plugins/` are auto-loaded. See [Development](#development) for the test
and typecheck commands.

## Tools

| Tool | Purpose |
| --- | --- |
| `leetcode_fetch` | Fetch a problem by `mode` (`random` \| `specific` \| `daily` \| `filter`), `difficulty`, `tags`, `idOrSlug`. Skips premium problems. |
| `leetcode_scaffold` | Create the real-world project from a spec in any supported language. Rejects specs that mention LeetCode, the source title, or its slug. |

## The honest-practice guard

Two plugin hooks keep the exercise meaningful:

- **Leak rejection** — `leetcode_scaffold` scans every learner-visible string for
  the source title/slug and practice-site names (`leetcode`, `neetcode`, ...). If
  found, it refuses and tells the agent to rewrite.
- **Access block** — `tool.execute.before` blocks `read`/`write`/`edit`/`glob`/
  `grep`/`bash` from touching `tests/hidden/**`, `.practice-meta.json`, and
  `.practice/meta.json`. You implement against the visible spec; the oracle stays
  out of reach.

## Configuration

| Env var | Default | Description |
| --- | --- | --- |
| `LEETCODE_API_BASE` | `https://leetcode-api-pied.vercel.app` | Base URL of the LeetCode API. |

Data comes from the community [leetcode-api](https://github.com/noworneverev/leetcode-api)
project. This plugin is not affiliated with LeetCode.

## Development

```bash
bun install
bun test          # unit + integration tests
bun run typecheck # tsc --noEmit
```

Run `opencode debug config` inside the repo to confirm the plugin and `/practice`
command are resolved.

## Project layout

```
src/
  index.ts      plugin entry: tools, guard hooks, command registration
  leetcode.ts   API client + normalizer (handles endpoint shape differences)
  languages.ts  per-language adapters: starter, build, run commands
  schema.ts     input/output schema inference + type generation
  patterns.ts   topic -> domain seeds, leak detection
  scaffold.ts   deterministic project writer (any supported language)
  guard.ts      protected-path detection
  prompt.ts     the /practice command template
  types.ts      shared types
.opencode/      local wiring so this repo is usable immediately
tests/          unit + integration tests
```
