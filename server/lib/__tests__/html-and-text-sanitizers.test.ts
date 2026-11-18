import { describe, expect, it } from "vitest";
import { stripScriptTags } from "../strip-script-tags";
import { trimEdgeChar } from "../trim-edge";
import { sanitizeSvg } from "../svg-sanitizer";
import { resolveMinifiedStack } from "../sourcemap-resolver";

describe("stripScriptTags", () => {
  it("removes script blocks and keeps the rest", () => {
    expect(stripScriptTags('<p>Hi</p><script>alert(1)</script><b>x</b>')).toBe("<p>Hi</p><b>x</b>");
  });

  it("removes a script that a single pass would leave behind", () => {
    const out = stripScriptTags("<scr<script>x</script>ipt>alert(1)</script>");
    expect(out.toLowerCase()).not.toContain("<script");
  });

  it("removes closing tags with attributes and unmatched tags", () => {
    expect(stripScriptTags("a<script>b</script foo>c")).toBe("ac");
    expect(stripScriptTags("a<SCRIPT src=x>b")).toBe("ab");
  });
});

describe("trimEdgeChar", () => {
  it("trims leading and trailing runs only", () => {
    expect(trimEdgeChar("--a-b--", "-")).toBe("a-b");
    expect(trimEdgeChar("----", "-")).toBe("");
    expect(trimEdgeChar("", "-")).toBe("");
  });

  it("stays fast on a long run that isn't at the end", () => {
    const input = "-".repeat(200_000) + "x" + "-".repeat(200_000) + "y";
    const started = Date.now();
    expect(trimEdgeChar(input, "-")).toBe("x" + "-".repeat(200_000) + "y");
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("sanitizeSvg", () => {
  it("removes a script rebuilt by an earlier removal", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><scr<script></script>ipt>alert(1)</script></svg>';
    const result = sanitizeSvg(svg);
    expect(result.ok).toBe(true);
    expect(result.content.toLowerCase()).not.toContain("<script");
  });

  it("removes an event handler rebuilt by an earlier removal", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect o<script></script>nload="alert(1)"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result.content).not.toMatch(/\son[a-z]+\s*=/i);
  });
});

describe("resolveMinifiedStack", () => {
  it("returns quickly on an oversized line", () => {
    const stack = "at " + "http://a/".repeat(50_000);
    const started = Date.now();
    expect(resolveMinifiedStack(stack)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
