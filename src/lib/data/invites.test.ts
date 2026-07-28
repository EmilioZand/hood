import { describe, expect, it } from "vitest";
import { generateInviteToken, validateInvite } from "./invites";

type FakeInvite = {
  id: string;
  token: string;
  email: string | null;
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
};

function fakeDb(invite: FakeInvite | null) {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (invite ? [invite] : []),
        }),
      }),
    }),
  };
  return db as never;
}

const baseInvite = (overrides: Partial<FakeInvite> = {}): FakeInvite => ({
  id: "invite-1",
  token: "tok123",
  email: null,
  usedAt: null,
  revokedAt: null,
  expiresAt: null,
  ...overrides,
});

describe("generateInviteToken", () => {
  it("returns a non-empty, URL-safe string", () => {
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns a different token each call", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});

describe("validateInvite", () => {
  it("rejects a missing token without querying the db", async () => {
    const result = await validateInvite(fakeDb(null), "");
    expect(result.valid).toBe(false);
  });

  it("rejects a token that doesn't exist", async () => {
    const result = await validateInvite(fakeDb(null), "unknown");
    expect(result.valid).toBe(false);
  });

  it("rejects a revoked invite", async () => {
    const result = await validateInvite(fakeDb(baseInvite({ revokedAt: new Date() })), "tok123");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/revoked/i);
  });

  it("rejects an already-used invite", async () => {
    const result = await validateInvite(fakeDb(baseInvite({ usedAt: new Date() })), "tok123");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/used/i);
  });

  it("rejects an expired invite", async () => {
    const result = await validateInvite(
      fakeDb(baseInvite({ expiresAt: new Date(Date.now() - 1000) })),
      "tok123",
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/expired/i);
  });

  it("accepts an invite with a future expiry", async () => {
    const result = await validateInvite(
      fakeDb(baseInvite({ expiresAt: new Date(Date.now() + 1000 * 60 * 60) })),
      "tok123",
    );
    expect(result.valid).toBe(true);
  });

  it("rejects when the invite is scoped to a different email", async () => {
    const result = await validateInvite(
      fakeDb(baseInvite({ email: "invited@example.com" })),
      "tok123",
      "someoneelse@example.com",
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/email/i);
  });

  it("accepts when the invite is scoped to a matching email (case-insensitive)", async () => {
    const result = await validateInvite(
      fakeDb(baseInvite({ email: "Invited@Example.com" })),
      "tok123",
      "invited@example.com",
    );
    expect(result.valid).toBe(true);
  });

  it("accepts an unscoped invite regardless of the submitted email", async () => {
    const result = await validateInvite(fakeDb(baseInvite()), "tok123", "anyone@example.com");
    expect(result.valid).toBe(true);
  });

  it("accepts a plain unused, unrevoked, unexpired invite with no email check", async () => {
    const result = await validateInvite(fakeDb(baseInvite()), "tok123");
    expect(result.valid).toBe(true);
  });
});
