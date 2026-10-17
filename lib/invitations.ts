import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db } from "./db";
import { adminTransaction, audit, ADMIN_LOCK } from "./admin";
import { getEnv } from "./env";
import { sendMail } from "./mail";
import { HttpError } from "./http";
import { inviteInput } from "./validation";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function invite(
  actorId: string,
  input: z.infer<typeof inviteInput>,
) {
  const token = randomBytes(32).toString("base64url");
  const invitation = await adminTransaction(actorId, async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email: input.email },
    });
    if (existing?.status === "SUSPENDED")
      throw new HttpError(
        409,
        "Reactivate this account before sending an invitation",
      );
    const invitation = await tx.invitation.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        name: input.name,
        globalRole: input.globalRole,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 86400000),
      },
      update: {
        name: input.name,
        globalRole: input.globalRole,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 86400000),
        acceptedAt: null,
      },
    });
    await tx.invitationGrant.deleteMany({
      where: { invitationId: invitation.id },
    });
    for (const grant of input.grants)
      await tx.invitationGrant.create({
        data: {
          ...grant,
          expiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
          invitationId: invitation.id,
        },
      });
    if (!existing)
      await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          status: "INVITED",
          globalRole: "EMPLOYEE",
        },
      });
    await audit(tx, actorId, "invitation.sent", invitation.id, undefined, {
      email: input.email,
      globalRole: input.globalRole,
    });
    return invitation;
  });
  const url = `${getEnv().BETTER_AUTH_URL}/accept-invitation?token=${token}`;
  try {
    await sendMail(
      input.email,
      `You're invited to ${getEnv().PRODUCT_NAME}`,
      `Hello ${input.name},\n\nAccept your invitation within 24 hours:\n${url}\n\nIf you did not expect this invitation, contact your company administrator.`,
    );
  } catch {
    throw new HttpError(
      503,
      "Invitation saved, but email delivery failed. Check SMTP and resend to generate a new link.",
    );
  }
  return {
    id: invitation.id,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
  };
}
export async function acceptInvitation(
  input: { token: string; name: string; password?: string },
  verifiedUserId?: string,
) {
  const hashed = input.password
    ? await hashPassword(input.password)
    : undefined;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK})`;
    const invitation = await tx.invitation.findUnique({
      where: { tokenHash: tokenHash(input.token) },
      include: { grants: true },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt <= new Date()
    )
      throw new HttpError(
        400,
        "This invitation is invalid, expired, or already accepted",
      );
    const consumed = await tx.invitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { acceptedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new HttpError(400, "Invitation already used");
    const user = await tx.user.findUniqueOrThrow({
      where: { email: invitation.email },
    });
    if (user.status === "SUSPENDED")
      throw new HttpError(403, "Account suspended");
    if (
      user.status === "ACTIVE" &&
      (!user.emailVerified || user.id !== verifiedUserId)
    )
      throw new HttpError(
        403,
        "Sign in with the existing invited account before accepting",
      );
    if (user.status === "INVITED") {
      if (!hashed)
        throw new HttpError(
          400,
          "A password of at least 12 characters is required",
        );
      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: hashed,
        },
      });
    }
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: input.name,
        status: "ACTIVE",
        emailVerified: true,
        globalRole:
          user.globalRole === "SUPERADMIN"
            ? "SUPERADMIN"
            : invitation.globalRole,
      },
    });
    for (const grant of invitation.grants)
      await tx.userPlatformAccess.upsert({
        where: {
          userId_platformId: { userId: user.id, platformId: grant.platformId },
        },
        create: {
          userId: user.id,
          platformId: grant.platformId,
          roleId: grant.roleId,
          expiresAt: grant.expiresAt,
        },
        update: {
          roleId: grant.roleId,
          expiresAt: grant.expiresAt,
          revokedAt: null,
        },
      });
    await audit(tx, user.id, "invitation.accepted", invitation.id);
    return { success: true };
  });
}
