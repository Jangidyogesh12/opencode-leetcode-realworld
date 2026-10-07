import {
  buildTypes,
  isFullyTyped,
  isIdentifier,
  isReserved,
  pascal,
  schemaSignature,
  snake,
  type SchemaNode,
  type TypeDecl,
  type TypeRef,
} from "./schema";
import type { FileEntry, LanguageId } from "./types";

export interface LanguageContext {
  projectName: string;
  functionName: string;
  title: string;
  input: SchemaNode;
  output: SchemaNode;
  inputExample: unknown;
  outputExample: unknown;
}

export interface LanguageAdapter {
  id: LanguageId;
  name: string;
  aliases: string[];
  extension: string;
  runtime: string;
  /** True when the starter exposes static types for the payload/result. */
  typed: boolean;
  starter(ctx: LanguageContext): string;
  files(ctx: LanguageContext): FileEntry[];
  build(ctx: LanguageContext): string | null;
  run(ctx: LanguageContext): string;
}

const INPUT_ROOT = "Payload";
const OUTPUT_ROOT = "Output";

function example(value: unknown): string {
  return JSON.stringify(value);
}

/** Format comment for languages without static types (and as a fallback). */
function formatComment(prefix: string, ctx: LanguageContext): string {
  return [
    `${prefix} Input format:  ${schemaSignature(ctx.input)}`,
    `${prefix} Input example: ${example(ctx.inputExample)}`,
    `${prefix} Output format: ${schemaSignature(ctx.output)}`,
    `${prefix} Output example: ${example(ctx.outputExample)}`,
  ].join("\n");
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

/* ------------------------------------------------------------------ */
/* TypeScript: named interfaces -> dot completion on `payload.`        */
/* ------------------------------------------------------------------ */

function tsRef(ref: TypeRef): string {
  switch (ref.t) {
    case "string":
      return "string";
    case "int":
    case "double":
      return "number";
    case "bool":
      return "boolean";
    case "any":
      return "unknown";
    case "null":
      return "null";
    case "array": {
      const inner = tsRef(ref.of);
      return inner.includes(" ") ? `(${inner})[]` : `${inner}[]`;
    }
    case "named":
      return ref.name;
  }
}

function tsProp(name: string): string {
  return isIdentifier(name) && !isReserved(name) ? name : JSON.stringify(name);
}

function tsDecl(decl: TypeDecl): string {
  const fields = decl.fields
    .map((field) => `  ${tsProp(field.name)}${field.optional ? "?" : ""}: ${tsRef(field.ref)};`)
    .join("\n");
  return `interface ${decl.name} {\n${fields}\n}`;
}

function typescriptStarter(ctx: LanguageContext): string {
  const input = buildTypes(INPUT_ROOT, ctx.input);
  const output = buildTypes(OUTPUT_ROOT, ctx.output);
  const decls = [...input.decls, ...output.decls].map(tsDecl).join("\n\n");
  const inputType = tsRef(input.root);
  const outputType = tsRef(output.root);
  const header = decls ? `${decls}\n\n` : "";
  return `import { readFileSync } from "node:fs";

${header}function ${ctx.functionName}(payload: ${inputType}): ${outputType} {
  throw new Error("Not implemented: ${ctx.functionName}");
}

const input = readFileSync(0, "utf8");
const payload = JSON.parse(input.trim() === "" ? "null" : input) as ${inputType};
process.stdout.write(JSON.stringify(${ctx.functionName}(payload) ?? null));
`;
}

/* ------------------------------------------------------------------ */
/* Go: structs with json tags                                          */
/* ------------------------------------------------------------------ */

function goRef(ref: TypeRef): string {
  switch (ref.t) {
    case "string":
      return "string";
    case "int":
      return "int";
    case "double":
      return "float64";
    case "bool":
      return "bool";
    case "any":
    case "null":
      return "any";
    case "array":
      return "[]" + goRef(ref.of);
    case "named":
      return ref.name;
  }
}

function goFieldName(name: string): string {
  const value = pascal(name);
  return value.length > 0 ? value : "Field";
}

function goDecl(decl: TypeDecl): string {
  const fields = decl.fields
    .map((field) => {
      const tag = `json:"${field.name}${field.optional ? ",omitempty" : ""}"`;
      return "\t" + goFieldName(field.name) + " " + goRef(field.ref) + " `" + tag + "`";
    })
    .join("\n");
  return `type ${decl.name} struct {\n${fields}\n}`;
}

function goAliasOrDecls(
  root: TypeRef,
  decls: TypeDecl[],
  rootName: string,
): string {
  const pieces = decls.map(goDecl);
  if (root.t !== "named") pieces.unshift(`type ${rootName} = ${goRef(root)}`);
  return pieces.join("\n\n");
}

function goStarter(ctx: LanguageContext): string {
  const input = buildTypes(INPUT_ROOT, ctx.input);
  const output = buildTypes(OUTPUT_ROOT, ctx.output);
  const types = [
    goAliasOrDecls(input.root, input.decls, INPUT_ROOT),
    goAliasOrDecls(output.root, output.decls, OUTPUT_ROOT),
  ].join("\n\n");
  return `package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

${types}

func ${ctx.functionName}(payload ${INPUT_ROOT}) ${OUTPUT_ROOT} {
	panic("Not implemented: ${ctx.functionName}")
}

func main() {
	raw, _ := io.ReadAll(os.Stdin)
	var payload ${INPUT_ROOT}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			panic(err)
		}
	}
	out, err := json.Marshal(${ctx.functionName}(payload))
	if err != nil {
		panic(err)
	}
	fmt.Print(string(out))
}
`;
}

/* ------------------------------------------------------------------ */
/* Rust: serde structs                                                 */
/* ------------------------------------------------------------------ */

function rustRef(ref: TypeRef): string {
  switch (ref.t) {
    case "string":
      return "String";
    case "int":
      return "i64";
    case "double":
      return "f64";
    case "bool":
      return "bool";
    case "any":
    case "null":
      return "serde_json::Value";
    case "array":
      return `Vec<${rustRef(ref.of)}>`;
    case "named":
      return ref.name;
  }
}

function rustField(name: string): string {
  let value = snake(name);
  if (isReserved(value)) value = `${value}_`;
  return value;
}

function rustDecl(decl: TypeDecl): string {
  const fields = decl.fields
    .map((field) => {
      const ident = rustField(field.name);
      const base = rustRef(field.ref);
      const ty = field.optional ? `Option<${base}>` : base;
      const attrs: string[] = [];
      if (ident !== field.name) attrs.push(`    #[serde(rename = "${field.name}")]`);
      if (field.optional) {
        attrs.push('    #[serde(default, skip_serializing_if = "Option::is_none")]');
      }
      const attrText = attrs.length > 0 ? attrs.join("\n") + "\n" : "";
      return `${attrText}    ${ident}: ${ty},`;
    })
    .join("\n");
  return `#[derive(Serialize, Deserialize)]\nstruct ${decl.name} {\n${fields}\n}`;
}

function rustAliasOrDecls(root: TypeRef, decls: TypeDecl[], rootName: string): string {
  const pieces = decls.map(rustDecl);
  if (root.t !== "named") pieces.unshift(`type ${rootName} = ${rustRef(root)};`);
  return pieces.join("\n\n");
}

function rustStarter(ctx: LanguageContext): string {
  const input = buildTypes(INPUT_ROOT, ctx.input);
  const output = buildTypes(OUTPUT_ROOT, ctx.output);
  const types = [
    rustAliasOrDecls(input.root, input.decls, INPUT_ROOT),
    rustAliasOrDecls(output.root, output.decls, OUTPUT_ROOT),
  ].join("\n\n");
  return `use serde::{Deserialize, Serialize};
use std::io::Read;

${types}

fn ${ctx.functionName}(payload: ${INPUT_ROOT}) -> ${OUTPUT_ROOT} {
    let _ = &payload;
    panic!("Not implemented: ${ctx.functionName}");
}

fn main() {
    let mut raw = String::new();
    std::io::stdin().read_to_string(&mut raw).expect("read stdin");
    let trimmed = raw.trim();
    let source = if trimmed.is_empty() { "null" } else { trimmed };
    let payload: ${INPUT_ROOT} = serde_json::from_str(source).expect("parse json");
    let result = ${ctx.functionName}(payload);
    println!("{}", serde_json::to_string(&result).expect("serialize json"));
}
`;
}

/* ------------------------------------------------------------------ */
/* C#: classes with JsonPropertyName                                   */
/* ------------------------------------------------------------------ */

function csRef(ref: TypeRef): string {
  switch (ref.t) {
    case "string":
      return "string";
    case "int":
      return "long";
    case "double":
      return "double";
    case "bool":
      return "bool";
    case "any":
    case "null":
      return "JsonNode";
    case "array":
      return `List<${csRef(ref.of)}>`;
    case "named":
      return ref.name;
  }
}

function csFieldName(name: string): string {
  const value = pascal(name);
  return value.length > 0 ? value : "Field";
}

function csDecl(decl: TypeDecl): string {
  const props = decl.fields
    .map((field) => {
      return `    [JsonPropertyName("${field.name}")]\n    public ${csRef(field.ref)} ${csFieldName(
        field.name,
      )} { get; set; }`;
    })
    .join("\n\n");
  return `class ${decl.name}\n{\n${props}\n}`;
}

function csStarter(ctx: LanguageContext): string {
  const input = buildTypes(INPUT_ROOT, ctx.input);
  const output = buildTypes(OUTPUT_ROOT, ctx.output);
  const decls = [...input.decls, ...output.decls].map(csDecl).join("\n\n");
  const inputType = csRef(input.root);
  const outputType = csRef(output.root);
  return `using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

${decls}

class Program
{
    static ${outputType} ${ctx.functionName}(${inputType} payload)
    {
        throw new NotImplementedException("Not implemented: ${ctx.functionName}");
    }

    static void Main()
    {
        var raw = Console.In.ReadToEnd().Trim();
        var payload = JsonSerializer.Deserialize<${inputType}>(raw);
        Console.Write(JsonSerializer.Serialize(${ctx.functionName}(payload)));
    }
}
`;
}

/* ------------------------------------------------------------------ */
/* Swift: Codable structs (only when the schema is fully typed)        */
/* ------------------------------------------------------------------ */

function swiftRef(ref: TypeRef): string {
  switch (ref.t) {
    case "string":
      return "String";
    case "int":
      return "Int";
    case "double":
      return "Double";
    case "bool":
      return "Bool";
    case "array":
      return `[${swiftRef(ref.of)}]`;
    case "named":
      return ref.name;
    default:
      return "Any";
  }
}

function swiftFieldName(name: string): string {
  if (isIdentifier(name) && !isReserved(name)) return name;
  let value = snake(name);
  if (isReserved(value)) value = `${value}_`;
  return isIdentifier(value) ? value : "field";
}

function swiftDecl(decl: TypeDecl): string {
  const fields: string[] = [];
  const codingKeys: string[] = [];
  let needsKeys = false;
  for (const field of decl.fields) {
    const prop = swiftFieldName(field.name);
    const base = swiftRef(field.ref);
    const ty = field.optional ? `${base}?` : base;
    fields.push(`    let ${prop}: ${ty}`);
    if (prop !== field.name) {
      needsKeys = true;
      codingKeys.push(`        case ${prop} = "${field.name}"`);
    } else {
      codingKeys.push(`        case ${prop}`);
    }
  }
  const keys = needsKeys ? `\n\n    enum CodingKeys: String, CodingKey {\n${codingKeys.join("\n")}\n    }` : "";
  return `struct ${decl.name}: Codable {\n${fields.join("\n")}${keys}\n}`;
}

function swiftAliasOrDecls(root: TypeRef, decls: TypeDecl[], rootName: string): string {
  const pieces = decls.map(swiftDecl);
  if (root.t !== "named") pieces.unshift(`typealias ${rootName} = ${swiftRef(root)}`);
  return pieces.join("\n\n");
}

function swiftStarter(ctx: LanguageContext): string {
  const input = buildTypes(INPUT_ROOT, ctx.input);
  const output = buildTypes(OUTPUT_ROOT, ctx.output);
  const types = [
    swiftAliasOrDecls(input.root, input.decls, INPUT_ROOT),
    swiftAliasOrDecls(output.root, output.decls, OUTPUT_ROOT),
  ].join("\n\n");
  return `import Foundation

${types}

func ${ctx.functionName}(_ payload: ${INPUT_ROOT}) -> ${OUTPUT_ROOT} {
    fatalError("Not implemented: ${ctx.functionName}")
}

let raw = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
let data = trimmed.isEmpty ? Data("null".utf8) : Data(raw.utf8)
let payload = try! JSONDecoder().decode(${INPUT_ROOT}.self, from: data)
let out = try! JSONEncoder().encode(${ctx.functionName}(payload))
FileHandle.standardOutput.write(out)
`;
}

function swiftFallbackStarter(ctx: LanguageContext): string {
  return `import Foundation

${formatComment("//", ctx)}

func ${ctx.functionName}(_ payload: Any) -> Any {
    fatalError("Not implemented: ${ctx.functionName}")
}

let raw = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
let data = raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Data("null".utf8) : Data(raw.utf8)
let payload = try! JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
let out = try! JSONSerialization.data(withJSONObject: ${ctx.functionName}(payload), options: [.fragmentsAllowed])
FileHandle.standardOutput.write(out)
`;
}

const adapters: Record<LanguageId, LanguageAdapter> = {
  typescript: {
    id: "typescript",
    name: "TypeScript",
    aliases: ["ts"],
    extension: "ts",
    runtime: "Node.js 22.6+ (uses `--experimental-strip-types`)",
    typed: true,
    starter: typescriptStarter,
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
    run: () => "node --experimental-strip-types src/solution.ts",
  },

  javascript: {
    id: "javascript",
    name: "JavaScript",
    aliases: ["js", "node"],
    extension: "mjs",
    runtime: "Node.js 18+",
    typed: false,
    starter: (ctx) => `${formatComment("//", ctx)}

function ${ctx.functionName}(payload) {
  throw new Error("Not implemented: ${ctx.functionName}");
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = Buffer.concat(chunks).toString("utf8");
const payload = JSON.parse(input.trim() === "" ? "null" : input);
process.stdout.write(JSON.stringify(${ctx.functionName}(payload) ?? null));
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
    typed: false,
    starter: (ctx) => `${formatComment("#", ctx)}

import json
import sys


def ${ctx.functionName}(payload):
    raise NotImplementedError("Not implemented: ${ctx.functionName}")


def main():
    raw = sys.stdin.read().strip()
    payload = json.loads(raw) if raw else None
    print(json.dumps(${ctx.functionName}(payload)))


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
    typed: false,
    starter: (ctx) => `${formatComment("#", ctx)}

require "json"

def ${ctx.functionName}(payload)
  raise NotImplementedError, "Not implemented: ${ctx.functionName}"
end

raw = $stdin.read.strip
payload = raw.empty? ? nil : JSON.parse(raw)
puts JSON.generate(${ctx.functionName}(payload))
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
    typed: false,
    starter: (ctx) => `<?php
${formatComment("//", ctx)}

function ${ctx.functionName}($payload) {
    throw new Exception("Not implemented: ${ctx.functionName}");
}

$raw = trim(stream_get_contents(STDIN));
$payload = $raw === "" ? null : json_decode($raw, true);
echo json_encode(${ctx.functionName}($payload));
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
    runtime: "Go 1.18+ (`any`)",
    typed: true,
    starter: goStarter,
    files: () => [{ relative: "go.mod", contents: "module practice\n\ngo 1.21\n" }],
    build: () => "mkdir -p out && go build -o out/solution src/solution.go",
    run: () => "./out/solution",
  },

  rust: {
    id: "rust",
    name: "Rust",
    aliases: ["rs", "cargo"],
    extension: "rs",
    runtime: "Rust 1.70+ (serde + serde_json)",
    typed: true,
    starter: rustStarter,
    files: (ctx) => [
      {
        relative: "Cargo.toml",
        contents: `[package]
name = "${ctx.projectName}"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
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
    typed: true,
    starter: csStarter,
    files: (ctx) => [
      {
        relative: `${ctx.projectName}.csproj`,
        contents: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>disable</Nullable>
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
    runtime: "Swift 5.5+",
    typed: true,
    starter: (ctx) => (isFullyTyped(ctx.input) && isFullyTyped(ctx.output) ? swiftStarter(ctx) : swiftFallbackStarter(ctx)),
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
