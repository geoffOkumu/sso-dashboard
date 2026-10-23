import { hashPassword, verifyPassword } from "better-auth/crypto";
import { z } from "zod";
import { db } from "./db";
import { adminTransaction, audit, revokeSessions, ADMIN_LOCK } from "./admin";
import { HttpError } from "./http";
import { createUserInput, changeInitialPasswordInput } from "./validation";

export async function createUserWithPassword(
  actorId: string,
  rawInput: z.input<typeof createUserInput>,
) {
  const input = createUserInput.parse(rawInput);
  const password = await hashPassword(input.password);
  return adminTransaction(actorId, async (tx) => {
    if (await tx.user.findUnique({ where: { email: input.email } }))
      throw new HttpError(409, "A user with this email already exists");
    for (const grant of input.grants) {
      const role = await tx.platformRole.findUnique({
        where: { id: grant.roleId },
        include: { platform: true },
      });
      if (
        !role ||
        role.platformId !== grant.platformId ||
        role.platform.type !== "SSO"
      )
        throw new HttpError(
          400,
          "Role must belong to the selected SSO platform",
        );
    }
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        globalRole: input.globalRole,
        status: "ACTIVE",
        // This is an admin-provisioned identity; no email round trip is required.
        emailVerified: true,
        passwordChangeRequired: input.passwordChangeRequired,
      },
    });
    await tx.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password,
      },
    });
    for (const grant of input.grants)
      await tx.userPlatformAccess.create({
        data: {
          ...grant,
          userId: user.id,
          expiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
        },
      });
    // Invalidate any leftover invitation for this address as part of provisioning.
    await tx.invitation.deleteMany({ where: { email: input.email } });
    await audit(tx, actorId, "user.created", user.id, undefined, {
      email: input.email,
      globalRole: input.globalRole,
      passwordChangeRequired: input.passwordChangeRequired,
    });
    return user;
  });
}

export async function changeInitialPassword(
  userId: string,
  sessionId: string,
  rawInput: z.input<typeof changeInitialPasswordInput>,
) {
  const input = changeInitialPasswordInput.parse(rawInput);
  const account = await db.account.findFirst({
    where: { userId, providerId: "credential" },
  });
  if (
    !account?.password ||
    !(await verifyPassword({
      hash: account.password,
      password: input.currentPassword,
    }))
  )
    throw new HttpError(400, "Current password is incorrect");
  if (
    await verifyPassword({
      hash: account.password,
      password: input.newPassword,
    })
  )
    throw new HttpError(
      400,
      "Choose a password different from your temporary password",
    );
  const password = await hashPassword(input.newPassword);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK})`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !session ||
      session.userId !== userId ||
      session.expiresAt <= new Date() ||
      session.securityVersion !== user.securityVersion
    )
      throw new HttpError(401, "Your session has expired or was revoked");
    if (!user.passwordChangeRequired)
      throw new HttpError(
        409,
        "A first-use password change is no longer required",
      );
    // Compare-and-swap prevents concurrent reset requests from reusing the old password.
    const changed = await tx.account.updateMany({
      where: { id: account.id, password: account.password },
      data: { password },
    });
    if (changed.count !== 1)
      throw new HttpError(409, "Your password has changed. Sign in again.");
    await tx.user.update({
      where: { id: userId },
      data: { passwordChangeRequired: false },
    });
    await revokeSessions(tx, userId);
    await audit(tx, userId, "account.initial_password_changed", userId);
    return { success: true };
  });
}
