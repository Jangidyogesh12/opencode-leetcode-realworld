/**
 * Infers a small structural schema from the sample test cases so the generated
 * starter files can carry real types (type-safe languages) or a documented
 * format (dynamic languages).
 *
 * This is intentionally schema-light: it only needs enough fidelity to describe
 * JSON input/output shapes (objects, arrays, primitives, optionality).
 */

export type SchemaNode =
  | { kind: "string" }
  | { kind: "number"; integer: boolean }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "unknown" }
  | { kind: "array"; element: SchemaNode }
  | { kind: "object"; fields: FieldSchema[] };

export interface FieldSchema {
  name: string;
  schema: SchemaNode;
  optional: boolean;
}

export function inferSchema(value: unknown): SchemaNode {
  if (value === null || value === undefined) return { kind: "null" };
  if (Array.isArray(value)) {
    return { kind: "array", element: mergeMany(value.map(inferSchema)) };
  }
  switch (typeof value) {
    case "string":
      return { kind: "string" };
    case "boolean":
      return { kind: "boolean" };
    case "number":
      return { kind: "number", integer: Number.isInteger(value) };
    case "object": {
      const fields = Object.entries(value as Record<string, unknown>).map(([name, entry]) => ({
        name,
        schema: inferSchema(entry),
        optional: false,
      }));
      return { kind: "object", fields };
    }
    default:
      return { kind: "unknown" };
  }
}

export function mergeSchemas(a: SchemaNode, b: SchemaNode): SchemaNode {
  if (a.kind === "unknown") return b;
  if (b.kind === "unknown") return a;
  if (a.kind === "null") return b;
  if (b.kind === "null") return a;

  if (a.kind === "object" && b.kind === "object") {
    const names = new Set([...a.fields.map((f) => f.name), ...b.fields.map((f) => f.name)]);
    const fields: FieldSchema[] = [];
    for (const name of names) {
      const left = a.fields.find((f) => f.name === name);
      const right = b.fields.find((f) => f.name === name);
      if (left && right) {
        fields.push({
          name,
          schema: mergeSchemas(left.schema, right.schema),
          optional: left.optional && right.optional,
        });
      } else {
        const only = (left ?? right)!;
        fields.push({ name, schema: only.schema, optional: true });
      }
    }
    return { kind: "object", fields };
  }

  if (a.kind === "array" && b.kind === "array") {
    return { kind: "array", element: mergeSchemas(a.element, b.element) };
  }

  if (a.kind === "number" && b.kind === "number") {
    return { kind: "number", integer: a.integer && b.integer };
  }
  if (a.kind === b.kind) return a;
  return { kind: "unknown" };
}

function mergeMany(nodes: SchemaNode[]): SchemaNode {
  if (nodes.length === 0) return { kind: "unknown" };
  return nodes.reduce((acc, node) => mergeSchemas(acc, node));
}

export function schemaFromSamples(values: unknown[]): SchemaNode {
  return mergeMany(values.map(inferSchema));
}

/** True when the schema contains only types representable as static types. */
export function isFullyTyped(node: SchemaNode): boolean {
  switch (node.kind) {
    case "unknown":
    case "null":
      return false;
    case "array":
      return isFullyTyped(node.element);
    case "object":
      return node.fields.every((field) => isFullyTyped(field.schema));
    default:
      return true;
  }
}

/** Human-readable signature, e.g. `{ amounts: number[]; target: number }`. */
export function schemaSignature(node: SchemaNode): string {
  switch (node.kind) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "unknown":
      return "any";
    case "array": {
      const inner = schemaSignature(node.element);
      return inner.includes(" ") ? `(${inner})[]` : `${inner}[]`;
    }
    case "object":
      if (node.fields.length === 0) return "{}";
      return `{ ${node.fields
        .map((field) => `${field.name}${field.optional ? "?" : ""}: ${schemaSignature(field.schema)}`)
        .join("; ")} }`;
  }
}

export type TypeRef =
  | { t: "string" }
  | { t: "int" }
  | { t: "double" }
  | { t: "bool" }
  | { t: "any" }
  | { t: "null" }
  | { t: "array"; of: TypeRef }
  | { t: "named"; name: string };

export interface TypeDecl {
  name: string;
  fields: { name: string; ref: TypeRef; optional: boolean }[];
}

export function buildTypes(
  rootName: string,
  node: SchemaNode,
): { root: TypeRef; decls: TypeDecl[] } {
  const decls: TypeDecl[] = [];
  const root = refFor(rootName, node, decls);
  return { root, decls };
}

function refFor(name: string, node: SchemaNode, decls: TypeDecl[]): TypeRef {
  switch (node.kind) {
    case "object": {
      const decl: TypeDecl = { name, fields: [] };
      decls.push(decl);
      for (const field of node.fields) {
        decl.fields.push({
          name: field.name,
          optional: field.optional,
          ref: refFor(`${name}${pascal(field.name)}`, field.schema, decls),
        });
      }
      return { t: "named", name };
    }
    case "array":
      return { t: "array", of: refFor(`${name}Item`, node.element, decls) };
    case "string":
      return { t: "string" };
    case "boolean":
      return { t: "bool" };
    case "null":
      return { t: "null" };
    case "unknown":
      return { t: "any" };
    case "number":
      return { t: node.integer ? "int" : "double" };
  }
}

export function pascal(input: string): string {
  const parts = input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

export function snake(input: string): string {
  const value = input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return /^[0-9]/.test(value) ? `_${value}` : value || "field";
}

const RESERVED = new Set([
  "abstract", "as", "async", "await", "base", "bool", "break", "byte", "case", "catch",
  "class", "const", "continue", "crate", "default", "delegate", "do", "double", "dyn",
  "else", "enum", "event", "explicit", "extern", "false", "final", "finally", "fixed",
  "float", "fn", "for", "foreach", "func", "goto", "if", "impl", "implements", "import",
  "in", "int", "interface", "internal", "is", "let", "lock", "long", "loop", "match",
  "mod", "move", "mut", "namespace", "new", "null", "object", "operator", "out",
  "override", "package", "params", "private", "protected", "pub", "public", "readonly",
  "ref", "return", "self", "short", "sizeof", "static", "string", "struct", "super",
  "switch", "this", "throw", "trait", "true", "try", "type", "typeof", "uint", "ulong",
  "unchecked", "unsafe", "use", "ushort", "var", "virtual", "void", "volatile", "where",
  "while", "with", "yield",
]);

export function isReserved(word: string): boolean {
  return RESERVED.has(word.toLowerCase());
}

export function isIdentifier(word: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(word);
}
