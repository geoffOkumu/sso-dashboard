import { Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
export type Tx = Prisma.TransactionClient;
export const ADMIN_LOCK = 8675309;
export async function adminTransaction<T>(
  actorId: string,
  fn: (tx: Tx) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK})`;
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (
        actor?.globalRole !== "SUPERADMIN" ||
        actor.status !== "ACTIVE" ||
        !actor.twoFactorEnabled ||
        actor.passwordChangeRequired
      )
        throw new HttpError(403, "Active superadmin with MFA required");
      return fn(tx);
    },
    { timeout: 15000 },
  );
}
export async function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  targetId?: string,
  platformId?: string,
  details?: Prisma.InputJsonObject,
) {
  await tx.auditLog.create({
    data: { actorId, action, targetId, platformId, details },
  });
}
export async function revokeSessions(tx: Tx, userId: string) {
  await tx.user.update({
    where: { id: userId },
    data: { securityVersion: { increment: 1 } },
  });
  await tx.oauthAccessToken.deleteMany({ where: { userId } });
  await tx.oauthRefreshToken.deleteMany({ where: { userId } });
  await tx.session.deleteMany({ where: { userId } });
  await tx.verification.deleteMany({ where: { value: userId } });
}
export async function updateUser(
  actorId: string,
  userId: string,
  input: {
    status?: "ACTIVE" | "SUSPENDED";
    globalRole?: "EMPLOYEE" | "SUPERADMIN";
    revokeSessions?: boolean;
  },
) {
  return adminTransaction(actorId, async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status === "INVITED" && input.status === "ACTIVE")
      throw new HttpError(400, "Invited users must accept their invitation");
    const removingAdmin =
      user.status === "ACTIVE" &&
      user.globalRole === "SUPERADMIN" &&
      (input.status === "SUSPENDED" || input.globalRole === "EMPLOYEE");
    if (
      removingAdmin &&
      (await tx.user.count({
        where: { status: "ACTIVE", globalRole: "SUPERADMIN" },
      })) <= 1
    )
      throw new HttpError(
        409,
        "The last active superadmin cannot be suspended or demoted",
      );
    await tx.user.update({
      where: { id: userId },
      data: { status: input.status, globalRole: input.globalRole },
    });
    if (
      input.revokeSessions ||
      input.status === "SUSPENDED" ||
      input.globalRole !== undefined
    )
      await revokeSessions(tx, userId);
    await audit(
      tx,
      actorId,
      input.revokeSessions ? "user.sessions_revoked" : "user.updated",
      userId,
      undefined,
      { ...input },
    );
    return { success: true };
  });
}
