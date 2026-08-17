import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safeRedirect";

describe("safeRedirectPath", () => {
  it("passes through ordinary same-origin paths", () => {
    expect(safeRedirectPath("/")).toBe("/");
    expect(safeRedirectPath("/admin/matches")).toBe("/admin/matches");
    expect(safeRedirectPath("/?view=map&city=San+Francisco")).toBe("/?view=map&city=San+Francisco");
    expect(safeRedirectPath("/restaurants/abc-123?back=%2F")).toBe("/restaurants/abc-123?back=%2F");
  });

  it("falls back when there is no value", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("honors a custom fallback", () => {
    expect(safeRedirectPath("https://evil.com", "/login")).toBe("/login");
  });

  // The whole point of the helper: a post-auth redirect must not be able to leave the site.
  it("rejects absolute URLs to another origin", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRedirectPath("http://evil.com/login")).toBe("/");
    expect(safeRedirectPath("HTTPS://EVIL.COM")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("//evil.com/login")).toBe("/");
  });

  it("rejects backslash variants that parsers normalize to protocol-relative", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
    expect(safeRedirectPath("/\\/evil.com")).toBe("/");
  });

  // Regression: the URL parser removes tab/LF/CR before parsing, so these used to slip
  // past a naive startsWith("//") check and resolve to an external host.
  it("rejects control-character smuggling of a protocol-relative URL", () => {
    expect(safeRedirectPath("/\t/evil.com")).toBe("/");
    expect(safeRedirectPath("/\n/evil.com")).toBe("/");
    expect(safeRedirectPath("/\r/evil.com")).toBe("/");
    expect(safeRedirectPath("/\t\n\r/evil.com")).toBe("/");
    expect(safeRedirectPath("/\t\\evil.com")).toBe("/");
  });

  it("strips control characters from otherwise-safe paths so the checked value is the used value", () => {
    expect(safeRedirectPath("/adm\tin")).toBe("/admin");
    expect(safeRedirectPath("/admin\n")).toBe("/admin");
  });

  it("rejects non-http schemes and values with no leading slash", () => {
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
    expect(safeRedirectPath("data:text/html,<script>alert(1)</script>")).toBe("/");
    expect(safeRedirectPath("evil.com")).toBe("/");
    expect(safeRedirectPath("../admin")).toBe("/");
  });

  it("rejects a leading space that the parser would strip into a protocol-relative URL", () => {
    expect(safeRedirectPath(" //evil.com")).toBe("/");
    expect(safeRedirectPath("  https://evil.com")).toBe("/");
  });

  it("keeps encoded slashes as a path rather than treating them as an origin change", () => {
    // %2F stays part of the path, so this is same-origin and allowed.
    expect(safeRedirectPath("/%2F%2Fevil.com")).toBe("/%2F%2Fevil.com");
  });
});
