import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { invites } from "@/db/schema";

/** URL-safe random token for an invite link (`/signup?invite=<token>`). */
export function generateInviteToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export type InviteValidationResult =
  | { valid: true; invite: typeof invites.$inferSelect }
  | { valid: false; reason: string };

/**
 * Validates an invite token — shared by the password signup action and the OAuth
 * callback, since both paths can create a brand-new account. An invite is single-use
 * (consumed the moment it's redeemed) and optionally scoped to one email address;
 * with no email set, anyone holding the link can redeem it.
 */
export async function validateInvite(
  db: typeof dbType,
  token: string | null | undefined,
  email?: string | null,
): Promise<InviteValidationResult> {
  if (!token) return { valid: false, reason: "No invite token provided." };

  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite) return { valid: false, reason: "This invite link is invalid." };
  if (invite.revokedAt) return { valid: false, reason: "This invite has been revoked." };
  if (invite.usedAt) return { valid: false, reason: "This invite has already been used." };
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return { valid: false, reason: "This invite has expired." };
  }
  if (invite.email && email && invite.email.toLowerCase() !== email.toLowerCase()) {
    return { valid: false, reason: "This invite is for a different email address." };
  }

  return { valid: true, invite };
}

/** Marks an invite consumed. Callers are responsible for approving the redeeming profile. */
export async function consumeInvite(db: typeof dbType, inviteId: string, usedBy: string) {
  await db.update(invites).set({ usedBy, usedAt: new Date() }).where(eq(invites.id, inviteId));
}
