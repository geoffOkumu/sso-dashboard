import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { SMTPServer } from "smtp-server";
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
import { db } from "../lib/db";
import { auth } from "../lib/auth";
import { invite, acceptInvitation } from "../lib/invitations";
import { POST as authRoute } from "../app/api/auth/[...all]/route";
let smtp: SMTPServer, actorId: string;
const messages: string[] = [];
let rejectMail = false;
beforeEach(async () => {
  await db.rateLimit.deleteMany();
  await db.requestLimit.deleteMany();
});
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
        if (rejectMail) return callback(new Error("Test SMTP failure"));
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
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
function post(path: string, cookie = "", body: unknown = {}) {
  return auth.handler(authRequest(path, cookie, body));
}
function authRequest(path: string, cookie = "", body: unknown = {}) {
  return new Request(`http://localhost:3100/api/auth${path}`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:3100",
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}
async function mfaAccount() {
  const password = randomBytes(24).toString("base64url");
  const email = `mfa-${randomBytes(8).toString("hex")}@company.test`;
  const user = await db.user.create({
    data: {
      email,
      name: "Email MFA user",
      emailVerified: true,
      status: "ACTIVE",
    },
  });
  await db.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(password),
    },
  });
  const login = () => post("/sign-in/email", "", { email, password });
  const cookie = cookies(await login());
  // A signed-in user cannot use email to skip authenticator enrollment.
  expect((await post("/two-factor/send-otp", cookie)).status).toBe(403);
  expect(
    (await post("/two-factor/verify-otp", cookie, { code: "123456" })).status,
  ).toBe(403);
  const setup = await post("/two-factor/enable", cookie, { password });
  expect(setup.status).toBe(200);
  const { totpURI } = await setup.json();
  const secret = new URL(totpURI).searchParams.get("secret")!;
  const code = await createOTP(
    new TextDecoder().decode(base32.decode(secret)),
  ).totp();
  expect((await post("/two-factor/verify-totp", cookie, { code })).status).toBe(
    200,
  );
  await db.session.deleteMany({ where: { userId: user.id } });
  const challenge = await login();
  expect(await challenge.json()).toMatchObject({ twoFactorRedirect: true });
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  // Enrollment rejection requests should not consume the sign-in test's send budget.
  await db.rateLimit.deleteMany();
  return { user, cookie: cookies(challenge) };
}
function latestCode() {
  const match = messages.at(-1)!.match(/Your sign-in code is: (\d{6})/);
  expect(match).not.toBeNull();
  return match![1];
}
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
  it("limits code requests and rejects a code after five failed verification attempts", async () => {
    const { user, cookie } = await mfaAccount();
    expect(
      (await authRoute(authRequest("/two-factor/send-otp", cookie))).status,
    ).toBe(200);
    const code = latestCode();
    for (let attempt = 0; attempt < 5; attempt++)
      expect(
        (await post("/two-factor/verify-otp", cookie, { code: "invalid" }))
          .status,
      ).toBe(401);
    expect(
      (await post("/two-factor/verify-otp", cookie, { code })).status,
    ).toBe(400);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      (await authRoute(authRequest("/two-factor/send-otp", cookie))).status,
    ).toBe(200);
    expect(
      (await authRoute(authRequest("/two-factor/send-otp", cookie))).status,
    ).toBe(429);
    expect(
      (await post("/two-factor/verify-otp", cookie, { code: latestCode() }))
        .status,
    ).toBe(200);
    await db.user.delete({ where: { id: user.id } });
  });
  it("requires a password challenge, sends hashed single-use MFA codes, and allows retry and resend", async () => {
    const count = messages.length;
    expect((await post("/two-factor/send-otp")).status).toBe(401);
    expect(messages).toHaveLength(count);
    const { user, cookie } = await mfaAccount();
    expect(messages).toHaveLength(count);
    expect((await post("/two-factor/send-otp", cookie)).status).toBe(200);
    expect(messages.at(-1)).toContain(`To: ${user.email}`);
    expect(messages.at(-1)).toContain("expires in 3 minutes");
    const firstCode = latestCode();
    const stored = await db.verification.findFirstOrThrow({
      where: { identifier: { startsWith: "2fa-otp-" } },
      orderBy: { createdAt: "desc" },
    });
    expect(stored.value).not.toContain(firstCode);
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(180000);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(
      (await post("/two-factor/verify-otp", cookie, { code: "invalid" }))
        .status,
    ).toBe(401);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await post("/two-factor/send-otp", cookie)).status).toBe(200);
    const code = latestCode();
    if (code !== firstCode)
      expect(
        (await post("/two-factor/verify-otp", cookie, { code: firstCode }))
          .status,
      ).toBe(401);
    const verified = await post("/two-factor/verify-otp", cookie, {
      code,
      trustDevice: false,
    });
    expect(verified.status).toBe(200);
    expect(cookies(verified)).toContain("company-access.session_token=");
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(
      (await post("/two-factor/verify-otp", cookie, { code })).status,
    ).toBe(401);
    await db.user.delete({ where: { id: user.id } });
  });
  it("rejects expired email codes and reports SMTP failures without signing in", async () => {
    const { user, cookie } = await mfaAccount();
    rejectMail = true;
    try {
      const failed = await post("/two-factor/send-otp", cookie);
      expect(failed.status).toBe(503);
      expect(await failed.json()).toMatchObject({
        message: expect.stringContaining("Could not send"),
      });
    } finally {
      rejectMail = false;
    }
    expect((await post("/two-factor/send-otp", cookie)).status).toBe(200);
    const code = latestCode();
    await db.verification.updateMany({
      where: { identifier: { startsWith: "2fa-otp-" } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await post("/two-factor/verify-otp", cookie, { code })).status,
    ).toBe(400);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    await db.user.delete({ where: { id: user.id } });
  });
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
