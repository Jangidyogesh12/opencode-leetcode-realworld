import { describe, expect, it } from "bun:test";
import { isProtectedReference } from "../src/guard";
import { normalizeProblem } from "../src/leetcode";
import { assertNoLeak, domainSeedsFor, findLeaks } from "../src/patterns";
import type { ScaffoldSpec } from "../src/types";

describe("normalizeProblem", () => {
  it("maps a full /problem payload to the normalized shape", () => {
    const problem = normalizeProblem({
      questionId: "1",
      questionFrontendId: "1",
      title: "Two Sum",
      titleSlug: "two-sum",
      difficulty: "Easy",
      content: "<p>Given <code>nums</code>, return indices.</p>",
      topicTags: [{ name: "Array" }, { name: "Hash Table" }],
      hints: ["<b>Use</b> a hash map"],
      codeSnippets: [{ lang: "C++", langSlug: "cpp", code: "int main(){}" }],
      stats: '{"acRate": "58.0%"}',
    });

    expect(problem.slug).toBe("two-sum");
    expect(problem.difficulty).toBe("Easy");
    expect(problem.topics).toEqual(["Array", "Hash Table"]);
    expect(problem.contentText).toBe("Given nums, return indices.");
    expect(problem.hints).toEqual(["Use a hash map"]);
    expect(problem.snippets[0]?.langSlug).toBe("cpp");
    expect(problem.acRate).toBe(58);
    expect(problem.url).toBe("https://leetcode.com/problems/two-sum/");
  });

  it("handles the /daily payload shape", () => {
    const problem = normalizeProblem({
      date: "2026-10-07",
      question: {
        questionId: "301",
        title: "Remove Invalid Parentheses",
        titleSlug: "remove-invalid-parentheses",
        difficulty: "Hard",
        content: "<p>Remove the minimum number.</p>",
        topicTags: [{ name: "Backtracking" }],
      },
    });

    expect(problem.date).toBe("2026-10-07");
    expect(problem.slug).toBe("remove-invalid-parentheses");
    expect(problem.topics).toEqual(["Backtracking"]);
  });
});

describe("patterns", () => {
  const baseSpec: ScaffoldSpec = {
    title: "Realtime Dedup Pipeline",
    scenario: "A payments service needs to drop duplicate events.",
    pattern: "hash table",
    sourceSlug: "two-sum",
    sourceTitle: "Two Sum",
  };

  it("suggests real-world domains from topic tags", () => {
    const seeds = domainSeedsFor(["Hash Table", "Sliding Window"]);
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds).toContain("API rate limiter");
  });

  it("detects generic practice-site branding", () => {
    const leaks = findLeaks({ ...baseSpec, scenario: "This is a LeetCode problem." });
    expect(leaks.some((leak) => leak.term === "leetcode")).toBe(true);
  });

  it("detects the original title and slug", () => {
    const leaks = findLeaks({ ...baseSpec, scenario: "Solve Two Sum efficiently." });
    expect(leaks.some((leak) => leak.field === "scenario")).toBe(true);
  });

  it("throws when a spec leaks", () => {
    expect(() => assertNoLeak({ ...baseSpec, requirements: ["Do the two-sum trick"] })).toThrow();
  });

  it("accepts a clean spec", () => {
    expect(() => assertNoLeak(baseSpec)).not.toThrow();
  });
});

describe("guard", () => {
  it("protects hidden tests and provenance files", () => {
    expect(isProtectedReference("./tests/hidden/core.test.ts")).toBe(true);
    expect(isProtectedReference("tests/hidden/core.test.py")).toBe(true);
    expect(isProtectedReference(".practice-meta.json")).toBe(true);
    expect(isProtectedReference("C:\\work\\tests\\hidden\\core.test.ts")).toBe(true);
  });

  it("allows ordinary project files", () => {
    expect(isProtectedReference("src/deduper.ts")).toBe(false);
    expect(isProtectedReference("tests/public/core.test.ts")).toBe(false);
  });
});
