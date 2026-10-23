import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { SMTPServer } from "smtp-server";
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../lib/db";
import { auth } from "../lib/auth";
import { invite, acceptInvitation } from "../lib/invitations";
let smtp: SMTPServer, actorId: string;
const messages: string[] = [];
beforeAll(async () => {
  if (!process.env.TEST_SCHEMA?.startsWith("test_access_"))
    throw new Error("Disposable test schema required");
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "3125";
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "";
  process.env.SMTP_PASSWORD = "";
  smtp = new SMTPServer({
    disabledCommands: ["AUTH", "STARTTLS"],
    onData(stream, _session, callback) {
      let body = "";
      stream.on("data", (chunk) => (body += chunk));
      stream.on("end", () => {
        messages.push(
          body
            .replace(/=\r?\n/g, "")
            .replace(/=([0-9A-F]{2})/g, (_, hex) =>
              String.fromCharCode(parseInt(hex, 16)),
            ),
        );
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => smtp.listen(3125, "127.0.0.1", resolve));
  actorId = (
    await db.user.create({
      data: {
        email: "email-admin@company.test",
        name: "Mail administrator",
        status: "ACTIVE",
        globalRole: "SUPERADMIN",
        emailVerified: true,
        twoFactorEnabled: true,
      },
    })
  ).id;
});
afterAll(async () => {
  await new Promise<void>((resolve) => smtp.close(resolve));
  if (actorId) await db.user.delete({ where: { id: actorId } });
  await db.$disconnect();
});
function latestToken() {
  const raw = messages
    .at(-1)!
    .match(
      /http:\/\/localhost:3100\/accept-invitation\?token=([A-Za-z0-9_-]+)/,
    );
  expect(raw).not.toBeNull();
  return raw![1];
}
describe("SMTP onboarding and reset", () => {
  it("delivers invitations and makes previous links invalid after resend", async () => {
    const input = {
      email: "email-invite@company.test",
      name: "Invited by mail",
      globalRole: "EMPLOYEE" as const,
      grants: [],
    };
    await invite(actorId, input);
    const first = latestToken();
    await invite(actorId, input);
    const second = latestToken();
    expect(first).not.toBe(second);
    await expect(
      acceptInvitation({ token: first, name: "Invite" }),
    ).rejects.toThrow("invalid");
    await expect(
      acceptInvitation({
        token: second,
        name: "Invite",
        password: randomBytes(24).toString("base64url"),
      }),
    ).resolves.toEqual({ success: true });
  });
  it("delivers a short-lived single-use reset link and revokes sessions", async () => {
    const email = "reset@company.test",
      old = randomBytes(24).toString("base64url"),
      password = randomBytes(24).toString("base64url");
    const user = await db.user.create({
      data: {
        email,
        name: "Reset user",
        passwordChangeRequired: true,
        status: "ACTIVE",
        emailVerified: true,
      },
    });
    await db.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(old),
      },
    });
    await (await auth.$context).internalAdapter.createSession(user.id);
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "http://localhost:3100/reset-password" },
    });
    const match = messages
      .at(-1)!
      .match(/http:\/\/localhost:3100\/api\/auth\/reset-password\/([^?\s]+)/);
    expect(match).not.toBeNull();
    const token = match![1];
    const stored = await db.verification.findFirstOrThrow({
      where: { identifier: `reset-password:${token}` },
    });
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      1800000,
    );
    await auth.api.resetPassword({ body: { token, newPassword: password } });
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: old } }),
    ).rejects.toThrow();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .passwordChangeRequired,
    ).toBe(false);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .securityVersion,
    ).toBe(2);
  });
});
