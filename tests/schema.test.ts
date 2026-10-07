import { describe, expect, it } from "bun:test";
import { buildTypes, isFullyTyped, mergeSchemas, schemaFromSamples, schemaSignature } from "../src/schema";

describe("schema", () => {
  it("infers primitives, arrays and objects", () => {
    const schema = schemaFromSamples([{ amounts: [2, 7, 11], target: 9, ok: true }]);
    expect(schemaSignature(schema)).toBe("{ amounts: number[]; target: number; ok: boolean }");
  });

  it("marks fields optional when missing in some samples", () => {
    const schema = schemaFromSamples([{ a: 1 }, { a: 2, b: "x" }]);
    expect(schemaSignature(schema)).toBe("{ a: number; b?: string }");
  });

  it("tracks integer vs float", () => {
    expect(schemaSignature(schemaFromSamples([[1, 2]]))).toBe("number[]");
    const { root } = buildTypes("Payload", schemaFromSamples([1]));
    expect(root).toEqual({ t: "int" });
    const { root: floatRoot } = buildTypes("Payload", schemaFromSamples([1.5]));
    expect(floatRoot).toEqual({ t: "double" });
  });

  it("merges mismatched scalars into any", () => {
    const schema = mergeSchemas(schemaFromSamples([1]), schemaFromSamples(["a"]));
    expect(schemaSignature(schema)).toBe("any");
    expect(isFullyTyped(schema)).toBe(false);
  });

  it("treats null as not fully typed", () => {
    expect(isFullyTyped(schemaFromSamples([null]))).toBe(false);
  });

  it("builds named types for nested objects", () => {
    const { root, decls } = buildTypes("Payload", schemaFromSamples([{ user: { id: 1, name: "a" } }]));
    expect(root).toEqual({ t: "named", name: "Payload" });
    const names = decls.map((decl) => decl.name);
    expect(names).toContain("Payload");
    expect(names).toContain("PayloadUser");
  });
});
