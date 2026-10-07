import type { FileEntry, LanguageId } from "./types";

export interface LanguageContext {
  projectName: string;
  functionName: string;
  title: string;
}

export interface LanguageAdapter {
  id: LanguageId;
  name: string;
  aliases: string[];
  extension: string;
  /** Human hint shown in the generated README. */
  runtime: string;
  starter(ctx: LanguageContext): string;
  /** Extra project files (build manifests etc). */
  files(ctx: LanguageContext): FileEntry[];
  /** Command run once before the cases, or null when not needed. */
  build(ctx: LanguageContext): string | null;
  /** Command that runs the solution once, reading one JSON value on stdin. */
  run(ctx: LanguageContext): string;
}

function packageJson(projectName: string, script: string): FileEntry {
  return {
    relative: "package.json",
    contents:
      JSON.stringify(
        {
          name: projectName,
          version: "0.1.0",
          private: true,
          type: "module",
          scripts: { test: script, check: script },
        },
        null,
        2,
      ) + "\n",
  };
}

const adapters: Record<LanguageId, LanguageAdapter> = {
  typescript: {
    id: "typescript",
    name: "TypeScript",
    aliases: ["ts"],
    extension: "ts",
    runtime: "Node.js 22.6+ (uses `--experimental-strip-types`)",
    starter: ({ functionName }) => `import { readFileSync } from "node:fs";

function ${functionName}(payload: unknown): unknown {
  throw new Error("Not implemented: ${functionName}");
}

const input = readFileSync(0, "utf8");
const payload = JSON.parse(input.trim() === "" ? "null" : input);
process.stdout.write(JSON.stringify(${functionName}(payload) ?? null));
`,
    files: (ctx) => [
      packageJson(ctx.projectName, "node tests/runner.mjs"),
      {
        relative: "tsconfig.json",
        contents:
          JSON.stringify(
            {
              compilerOptions: {
                target: "ES2022",
                module: "ESNext",
                moduleResolution: "bundler",
                strict: true,
                skipLibCheck: true,
                types: ["node"],
                noEmit: true,
              },
              include: ["src"],
            },
            null,
            2,
          ) + "\n",
      },
    ],
    build: () => null,
    run: ({ functionName }) => `node --experimental-strip-types src/solution.ts`,
  },

  javascript: {
    id: "javascript",
    name: "JavaScript",
    aliases: ["js", "node"],
    extension: "mjs",
    runtime: "Node.js 18+",
    starter: ({ functionName }) => `function ${functionName}(payload) {
  throw new Error("Not implemented: ${functionName}");
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = Buffer.concat(chunks).toString("utf8");
const payload = JSON.parse(input.trim() === "" ? "null" : input);
process.stdout.write(JSON.stringify(${functionName}(payload) ?? null));
`,
    files: (ctx) => [packageJson(ctx.projectName, "node tests/runner.mjs")],
    build: () => null,
    run: () => "node src/solution.mjs",
  },

  python: {
    id: "python",
    name: "Python",
    aliases: ["py", "python3"],
    extension: "py",
    runtime: "Python 3.8+",
    starter: ({ functionName }) => `import json
import sys


def ${functionName}(payload):
    raise NotImplementedError("Not implemented: ${functionName}")


def main():
    raw = sys.stdin.read().strip()
    payload = json.loads(raw) if raw else None
    print(json.dumps(${functionName}(payload)))


if __name__ == "__main__":
    main()
`,
    files: () => [],
    build: () => null,
    run: () => "python3 src/solution.py",
  },

  ruby: {
    id: "ruby",
    name: "Ruby",
    aliases: ["rb"],
    extension: "rb",
    runtime: "Ruby 2.6+ (json is in the standard library)",
    starter: ({ functionName }) => `require "json"

def ${functionName}(payload)
  raise NotImplementedError, "Not implemented: ${functionName}"
end

raw = $stdin.read.strip
payload = raw.empty? ? nil : JSON.parse(raw)
puts JSON.generate(${functionName}(payload))
`,
    files: () => [],
    build: () => null,
    run: () => "ruby src/solution.rb",
  },

  php: {
    id: "php",
    name: "PHP",
    aliases: ["php8"],
    extension: "php",
    runtime: "PHP 7.4+",
    starter: ({ functionName }) => `<?php

function ${functionName}($payload) {
    throw new Exception("Not implemented: ${functionName}");
}

$raw = trim(stream_get_contents(STDIN));
$payload = $raw === "" ? null : json_decode($raw, true);
echo json_encode(${functionName}($payload));
`,
    files: () => [],
    build: () => null,
    run: () => "php src/solution.php",
  },

  go: {
    id: "go",
    name: "Go",
    aliases: ["golang"],
    extension: "go",
    runtime: "Go 1.18+ (uses `any`)",
    starter: ({ functionName }) => `package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

func ${functionName}(payload any) any {
	panic("Not implemented: ${functionName}")
}

func main() {
	raw, _ := io.ReadAll(os.Stdin)
	var payload any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			panic(err)
		}
	}
	out, err := json.Marshal(${functionName}(payload))
	if err != nil {
		panic(err)
	}
	fmt.Print(string(out))
}
`,
    files: () => [
      { relative: "go.mod", contents: "module practice\n\ngo 1.21\n" },
    ],
    build: () => "mkdir -p out && go build -o out/solution src/solution.go",
    run: () => "./out/solution",
  },

  rust: {
    id: "rust",
    name: "Rust",
    aliases: ["rs", "cargo"],
    extension: "rs",
    runtime: "Rust 1.70+ (uses serde_json)",
    starter: ({ functionName }) => `use serde_json::Value;
use std::io::Read;

fn ${functionName}(payload: Value) -> Value {
    let _ = payload;
    panic!("Not implemented: ${functionName}");
}

fn main() {
    let mut raw = String::new();
    std::io::stdin().read_to_string(&mut raw).expect("read stdin");
    let trimmed = raw.trim();
    let payload: Value = if trimmed.is_empty() {
        Value::Null
    } else {
        serde_json::from_str(trimmed).expect("parse json")
    };
    let result = ${functionName}(payload);
    println!("{}", serde_json::to_string(&result).expect("serialize json"));
}
`,
    files: (ctx) => [
      {
        relative: "Cargo.toml",
        contents: `[package]
name = "${ctx.projectName}"
version = "0.1.0"
edition = "2021"

[dependencies]
serde_json = "1"

[[bin]]
name = "solution"
path = "src/solution.rs"
`,
      },
    ],
    build: () => "cargo build --quiet",
    run: () => "./target/debug/solution",
  },

  csharp: {
    id: "csharp",
    name: "C#",
    aliases: ["cs", "dotnet"],
    extension: "cs",
    runtime: ".NET 8 SDK",
    starter: ({ functionName }) => `using System;
using System.Text.Json.Nodes;

class Program
{
    static JsonNode? ${functionName}(JsonNode? payload)
    {
        throw new NotImplementedException("Not implemented: ${functionName}");
    }

    static void Main()
    {
        var raw = Console.In.ReadToEnd().Trim();
        var payload = raw.Length == 0 ? null : JsonNode.Parse(raw);
        Console.Write(${functionName}(payload)?.ToJsonString() ?? "null");
    }
}
`,
    files: (ctx) => [
      {
        relative: `${ctx.projectName}.csproj`,
        contents: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>solution</AssemblyName>
  </PropertyGroup>
</Project>
`,
      },
    ],
    build: () => "dotnet build -c Release -o out --nologo -v quiet",
    run: () => "dotnet out/solution.dll",
  },

  swift: {
    id: "swift",
    name: "Swift",
    aliases: [],
    extension: "swift",
    runtime: "Swift 5.5+ (Foundation JSONSerialization)",
    starter: ({ functionName }) => `import Foundation

func ${functionName}(_ payload: Any) -> Any {
    fatalError("Not implemented: ${functionName}")
}

let raw = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
let data = raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    ? Data("null".utf8)
    : Data(raw.utf8)
let payload = try! JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
let result = ${functionName}(payload)
let out = try! JSONSerialization.data(withJSONObject: result, options: [.fragmentsAllowed])
FileHandle.standardOutput.write(out)
`,
    files: () => [],
    build: () => "mkdir -p out && swiftc -O src/solution.swift -o out/solution",
    run: () => "./out/solution",
  },
};

export function getLanguage(id: LanguageId): LanguageAdapter {
  return adapters[id];
}

export function languageIds(): LanguageId[] {
  return Object.keys(adapters) as LanguageId[];
}

export function languageNames(): string {
  return languageIds()
    .map((id) => adapters[id].name)
    .join(", ");
}

export function normalizeLanguage(input: string | undefined): LanguageId | undefined {
  if (!input) return undefined;
  const key = input.trim().toLowerCase();
  for (const adapter of Object.values(adapters)) {
    if (adapter.id === key || adapter.aliases.includes(key)) return adapter.id;
  }
  return undefined;
}
