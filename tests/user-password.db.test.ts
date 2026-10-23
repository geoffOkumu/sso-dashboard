import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { serializeSignedCookie } from "better-call";
import { db } from "../lib/db";
import { auth } from "../lib/auth";
import { currentAccess } from "../lib/access";
import { requireUser } from "../lib/session";
import { createUserWithPassword } from "../lib/user-password";
import { POST as createUser } from "../app/api/admin/[...path]/route";
import { POST as changePassword } from "../app/api/me/change-initial-password/route";

const password = randomBytes(24).toString("base64url");
const newPassword = randomBytes(24).toString("base64url");
let adminId: string, adminCookie: string, platformId: string, roleId: string;
const userIds: string[] = [];
async function cookieFor(userId: string) {
  const session = await (
    await auth.$context
  ).internalAdapter.createSession(userId);
  return (
    await serializeSignedCookie(
      "company-access.session_token",
      session.token,
      process.env.BETTER_AUTH_SECRET!,
    )
  ).split(";")[0];
}
function request(
  path: string,
  cookie: string,
  body: unknown,
  origin = "http://localhost:3100",
) {
  return new Request(`http://localhost:3100${path}`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
async function provision(key: string, temporary = false) {
  const user = await createUserWithPassword(adminId, {
    name: "Password User",
    email: `password-${key}@test.example`,
    password,
    passwordChangeRequired: temporary,
    grants: [{ platformId, roleId }],
  });
  userIds.push(user.id);
  return user;
}
beforeAll(async () => {
  if (!process.env.TEST_SCHEMA?.startsWith("test_access_"))
    throw new Error("Disposable schema required");
  const admin = await db.user.create({
    data: {
      name: "Password Admin",
      email: "password-admin@test.example",
      emailVerified: true,
      status: "ACTIVE",
      globalRole: "SUPERADMIN",
      twoFactorEnabled: true,
    },
  });
  adminId = admin.id;
  userIds.push(admin.id);
  adminCookie = await cookieFor(adminId);
  const platform = await db.platform.create({
    data: {
      name: "Password Test",
      slug: "password-test",
      description: "",
      launchUrl: "https://example.test/login",
    },
  });
  platformId = platform.id;
  roleId = (
    await db.platformRole.create({
      data: { platformId, key: "viewer", name: "Viewer" },
    })
  ).id;
});
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  if (platformId) await db.platform.delete({ where: { id: platformId } });
  await db.$disconnect();
});

describe("administrator-set passwords", () => {
  it("creates an active credential and grants through the admin API without an invitation", async () => {
    const response = await createUser(
      request("/api/admin/users", adminCookie, {
        name: "Direct User",
        email: "PASSWORD-direct@test.example",
        password,
        grants: [{ platformId, roleId }],
      }),
      { params: Promise.resolve({ path: ["users"] }) },
    );
    expect(response.status).toBe(201);
    const user = await response.json();
    userIds.push(user.id);
    expect(user).toMatchObject({
      status: "ACTIVE",
      emailVerified: true,
      passwordChangeRequired: false,
      email: "password-direct@test.example",
    });
    expect(JSON.stringify(user)).not.toContain(password);
    expect(await db.invitation.count({ where: { email: user.email } })).toBe(0);
    const account = await db.account.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(account.password).not.toBe(password);
    expect(await verifyPassword({ hash: account.password!, password })).toBe(
      true,
    );
    const signedIn = await auth.api.signInEmail({
      body: { email: user.email, password },
    });
    expect(signedIn.user.id).toBe(user.id);
    expect((await currentAccess(user.id, platformId)).allowed).toBe(true);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { targetId: user.id, action: "user.created" },
    });
    expect(JSON.stringify(audit)).not.toContain(password);
    expect(JSON.stringify(audit)).not.toContain(account.password);
  });
  it("rejects duplicate accounts without changing their credentials", async () => {
    const user = await provision("duplicate");
    await expect(
      createUserWithPassword(adminId, {
        name: "Overwrite",
        email: user.email,
        password: newPassword,
      }),
    ).rejects.toThrow("already exists");
    expect(
      (await auth.api.signInEmail({ body: { email: user.email, password } }))
        .user.id,
    ).toBe(user.id);
  });
  it("rejects invalid grants without leaving an account", async () => {
    await expect(
      createUserWithPassword(adminId, {
        name: "Invalid Grant",
        email: "password-invalid@test.example",
        password,
        grants: [{ platformId: adminId, roleId }],
      }),
    ).rejects.toThrow("Role must belong");
    expect(
      await db.user.findUnique({
        where: { email: "password-invalid@test.example" },
      }),
    ).toBeNull();
  });
  it("rejects employee creation and cross-origin admin requests", async () => {
    const user = await provision("employee");
    const cookie = await cookieFor(user.id);
    for (const [credential, origin] of [
      [cookie, "http://localhost:3100"],
      [adminCookie, "https://evil.test"],
    ]) {
      const response = await createUser(
        request(
          "/api/admin/users",
          credential,
          {
            name: "Unauthorized",
            email: "password-unauthorized@test.example",
            password,
          },
          origin,
        ),
        { params: Promise.resolve({ path: ["users"] }) },
      );
      expect(response.status).toBe(403);
    }
  });
  it("restricts temporary-password sessions until an atomic change and rejects the old password", async () => {
    const user = await provision("temporary", true);
    const signedIn = await auth.api.signInEmail({
      body: { email: user.email, password },
    });
    expect(signedIn.user.id).toBe(user.id);
    const cookie = await cookieFor(user.id);
    await expect(requireUser(new Headers({ Cookie: cookie }))).rejects.toThrow(
      "temporary password",
    );
    expect((await currentAccess(user.id, platformId)).reason).toBe(
      "password_change_required",
    );
    const bypass = await auth.handler(
      request("/api/auth/change-password", cookie, {
        currentPassword: password,
        newPassword,
      }),
    );
    expect(bypass.status).toBe(403);
    const mfa = await auth.handler(
      request("/api/auth/two-factor/enable", cookie, { password }),
    );
    expect(mfa.status).toBe(403);
    for (const body of [
      { currentPassword: newPassword, newPassword },
      { currentPassword: password, newPassword: password },
      { currentPassword: password, newPassword: "short" },
    ]) {
      expect(
        (
          await changePassword(
            request("/api/me/change-initial-password", cookie, body),
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await changePassword(
          request(
            "/api/me/change-initial-password",
            cookie,
            {
              currentPassword: password,
              newPassword,
            },
            "https://evil.test",
          ),
        )
      ).status,
    ).toBe(403);
    const results = await Promise.all(
      [1, 2].map(() =>
        changePassword(
          request("/api/me/change-initial-password", cookie, {
            currentPassword: password,
            newPassword,
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.passwordChangeRequired).toBe(false);
    expect(updated.securityVersion).toBe(2);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    await expect(requireUser(new Headers({ Cookie: cookie }))).rejects.toThrow(
      "Sign in",
    );
    await expect(
      auth.api.signInEmail({ body: { email: user.email, password } }),
    ).rejects.toThrow();
    expect(
      (
        await auth.api.signInEmail({
          body: { email: user.email, password: newPassword },
        })
      ).user.id,
    ).toBe(user.id);
    expect((await currentAccess(user.id, platformId)).allowed).toBe(true);
  });
  it("rejects anonymous initial password changes", async () => {
    expect(
      (
        await changePassword(
          request("/api/me/change-initial-password", "", {
            currentPassword: password,
            newPassword,
          }),
        )
      ).status,
    ).toBe(401);
  });
});
