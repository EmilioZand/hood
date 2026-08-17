import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Browsing spots is public, but every mutation must still be gated server-side —
 * Drizzle talks to Postgres directly and doesn't enforce RLS, and proxy.ts only
 * redirects the browser (a hand-crafted POST skips it entirely). These are static
 * checks over the source rather than runtime calls, because the guards read
 * request-scoped cookies via next/headers, which has no meaningful standalone
 * context outside a request.
 */

const APP_DIR = join(process.cwd(), "src", "app");

/** Server-action files whose exports are intentionally unauthenticated. */
const PUBLIC_ACTION_FILES = [
  // These *are* the auth entry points — requiring a session would be circular.
  join("login", "actions.ts"),
];

function findActionFiles(dir: string): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return findActionFiles(full);
    return entry === "actions.ts" ? [full] : [];
  });
}

describe("server action auth coverage", () => {
  it("guards every exported server action with requireUser or requireAdmin", () => {
    const unguarded: string[] = [];

    for (const file of findActionFiles(APP_DIR)) {
      const relative = file.slice(APP_DIR.length + 1);
      if (PUBLIC_ACTION_FILES.includes(relative)) continue;

      const source = readFileSync(file, "utf8");
      // Each exported action's body runs until the next top-level export (or EOF);
      // splitting on the export keyword gives one chunk per action.
      const chunks = source.split(/^export async function /m).slice(1);
      for (const chunk of chunks) {
        const name = chunk.slice(0, chunk.indexOf("(")).trim();
        if (!/requireUser\(\)|requireAdmin\(\)/.test(chunk)) {
          unguarded.push(`${relative}: ${name}`);
        }
      }
    }

    expect(unguarded).toEqual([]);
  });

  it("makes requireUser reject an anonymous visitor rather than returning null", () => {
    const source = readFileSync(join(process.cwd(), "src", "lib", "auth", "guards.ts"), "utf8");
    const requireUserBody = source.slice(source.indexOf("export async function requireUser"));

    // getOptionalUser is the only place that tolerates a missing user; requireUser must
    // build on it and turn null into a thrown error.
    expect(requireUserBody).toContain("getOptionalUser()");
    expect(requireUserBody).toMatch(/if \(!user\)\s*\{\s*throw new UnauthorizedError/);
  });

  it("keeps requireAdmin stricter than requireUser", () => {
    const source = readFileSync(join(process.cwd(), "src", "lib", "auth", "guards.ts"), "utf8");
    const requireAdminBody = source.slice(source.indexOf("export async function requireAdmin"));

    expect(requireAdminBody).toContain("requireUser()");
    expect(requireAdminBody).toMatch(/if \(!user\.isAdmin\)\s*\{\s*throw new ForbiddenError/);
  });
});
