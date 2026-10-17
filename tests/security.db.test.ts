import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { serializeSignedCookie } from "better-call";
import { db } from "../lib/db";
import { auth } from "../lib/auth";
import { currentAccess } from "../lib/access";
import { updateUser, revokeSessions } from "../lib/admin";
import { acceptInvitation, tokenHash } from "../lib/invitations";
import {
  POST as adminPost,
  GET as adminGet,
} from "../app/api/admin/[...path]/route";
let adminId: string,
  employeeId: string,
  otherAdminId: string,
  platformId: string,
  otherPlatformId: string,
  roleId: string,
  otherRoleId: string,
  permissionId: string;
let employeeCookie: string;
beforeAll(async () => {
  if (!process.env.TEST_SCHEMA?.startsWith("test_access_"))
    throw new Error("Run through scripts/test-isolated.ts");
  const admin = await db.user.create({
    data: {
      name: "Admin One",
      email: "admin@test.example",
      emailVerified: true,
      status: "ACTIVE",
      globalRole: "SUPERADMIN",
      twoFactorEnabled: true,
    },
  });
  adminId = admin.id;
  otherAdminId = (
    await db.user.create({
      data: {
        name: "Admin Two",
        email: "admin2@test.example",
        emailVerified: true,
        status: "ACTIVE",
        globalRole: "SUPERADMIN",
        twoFactorEnabled: true,
      },
    })
  ).id;
  employeeId = (
    await db.user.create({
      data: {
        name: "Employee",
        email: "employee@test.example",
        emailVerified: true,
        status: "ACTIVE",
      },
    })
  ).id;
  platformId = (
    await db.platform.create({
      data: {
        name: "CRM",
        slug: "crm",
        description: "CRM",
        launchUrl: "http://localhost:3101/login",
      },
    })
  ).id;
  otherPlatformId = (
    await db.platform.create({
      data: {
        name: "Analytics",
        slug: "analytics",
        description: "Analytics",
        launchUrl: "http://localhost:3102/login",
      },
    })
  ).id;
  roleId = (
    await db.platformRole.create({
      data: { platformId, key: "viewer", name: "Viewer" },
    })
  ).id;
  otherRoleId = (
    await db.platformRole.create({
      data: { platformId: otherPlatformId, key: "admin", name: "Admin" },
    })
  ).id;
  permissionId = (
    await db.platformPermission.create({
      data: { platformId, key: "contacts.read", description: "Read contacts" },
    })
  ).id;
  await db.rolePermission.create({
    data: { roleId, permissionId, platformId },
  });
  await db.userPlatformAccess.create({
    data: { userId: employeeId, platformId, roleId },
  });
  const session = await (
    await auth.$context
  ).internalAdapter.createSession(employeeId);
  employeeCookie = (
    await serializeSignedCookie(
      "company-access.session_token",
      session.token,
      process.env.BETTER_AUTH_SECRET!,
    )
  ).split(";")[0];
});
afterAll(() => db.$disconnect());
describe("database and API security", () => {
  it("denies direct unassigned platform access and viewer writes", async () => {
    expect((await currentAccess(employeeId, platformId)).allowed).toBe(true);
    expect((await currentAccess(employeeId, otherPlatformId)).allowed).toBe(
      false,
    );
    expect(
      (
        await currentAccess(employeeId, platformId, {
          permission: "contacts.write",
        })
      ).allowed,
    ).toBe(false);
  });
  it("rejects cross-platform role assignments at the database boundary", async () => {
    await expect(
      db.userPlatformAccess.update({
        where: { userId_platformId: { userId: employeeId, platformId } },
        data: { roleId: otherRoleId },
      }),
    ).rejects.toThrow();
  });
  it("rejects cross-platform permission escalation at the database boundary", async () => {
    await expect(
      db.rolePermission.create({
        data: {
          platformId: otherPlatformId,
          roleId: otherRoleId,
          permissionId,
        },
      }),
    ).rejects.toThrow();
  });
  it("blocks employees from all central administrative reads and writes", async () => {
    for (const path of [["users"], ["platforms"], ["audit"], ["overview"]]) {
      const response = await adminGet(
        new Request("http://localhost:3100/api/admin/" + path.join("/"), {
          headers: { Cookie: employeeCookie },
        }),
        { params: Promise.resolve({ path }) },
      );
      expect(response.status).toBe(403);
    }
    const response = await adminPost(
      new Request("http://localhost:3100/api/admin/users/" + employeeId, {
        method: "POST",
        headers: {
          Cookie: employeeCookie,
          Origin: "http://localhost:3100",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ globalRole: "SUPERADMIN" }),
      }),
      { params: Promise.resolve({ path: ["users", employeeId] }) },
    );
    expect(response.status).toBe(403);
  });
  it("rejects cross-origin mutations before authorization", async () => {
    const response = await adminPost(
      new Request("http://localhost:3100/api/admin/users/x", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
        body: "{}",
      }),
      { params: Promise.resolve({ path: ["users", "x"] }) },
    );
    expect(response.status).toBe(403);
  });
  it("requires MFA for privileged APIs", async () => {
    const user = await db.user.create({
      data: {
        name: "Unenrolled",
        email: "no-mfa@test.example",
        status: "ACTIVE",
        emailVerified: true,
        globalRole: "SUPERADMIN",
      },
    });
    const s = await (
      await auth.$context
    ).internalAdapter.createSession(user.id);
    const cookie = (
      await serializeSignedCookie(
        "company-access.session_token",
        s.token,
        process.env.BETTER_AUTH_SECRET!,
      )
    ).split(";")[0];
    const response = await adminGet(
      new Request("http://localhost:3100/api/admin/users", {
        headers: { Cookie: cookie },
      }),
      { params: Promise.resolve({ path: ["users"] }) },
    );
    expect(response.status).toBe(403);
    await db.user.delete({ where: { id: user.id } });
  });
  it("accepts an invitation exactly once and atomically creates intended access", async () => {
    const token = randomBytes(32).toString("base64url");
    const invited = await db.user.create({
      data: { name: "Invited", email: "invited@test.example" },
    });
    await db.invitation.create({
      data: {
        email: invited.email,
        name: invited.name,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 60000),
        grants: { create: { platformId, roleId } },
      },
    });
    const inputs = {
      token,
      name: "Invited User",
      password: randomBytes(24).toString("base64url"),
    };
    const results = await Promise.allSettled([
      acceptInvitation(inputs),
      acceptInvitation(inputs),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const user = await db.user.findUniqueOrThrow({ where: { id: invited.id } });
    expect(user.emailVerified).toBe(true);
    expect(user.status).toBe("ACTIVE");
    expect((await currentAccess(user.id, platformId)).role).toBe("viewer");
  });
  it("rejects invalid and expired invitation tokens", async () => {
    await expect(
      acceptInvitation({ token: "invalid", name: "No" }),
    ).rejects.toThrow("invalid");
    const token = randomBytes(32).toString("base64url");
    await db.invitation.create({
      data: {
        email: "expired@test.example",
        name: "Expired",
        tokenHash: tokenHash(token),
        expiresAt: new Date(0),
      },
    });
    await expect(acceptInvitation({ token, name: "No" })).rejects.toThrow(
      "expired",
    );
  });
  it("requires the matching verified existing account to accept an invitation", async () => {
    const token = randomBytes(32).toString("base64url");
    await db.invitation.create({
      data: {
        email: "employee@test.example",
        name: "Employee",
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await expect(
      acceptInvitation({ token, name: "Employee" }, adminId),
    ).rejects.toThrow("existing invited account");
    expect(
      (
        await db.invitation.findUniqueOrThrow({
          where: { email: "employee@test.example" },
        })
      ).acceptedAt,
    ).toBeNull();
    await expect(
      acceptInvitation({ token, name: "Employee" }, employeeId),
    ).resolves.toEqual({ success: true });
  });
  it("observes permission edits and revocations immediately in authoritative policy", async () => {
    await db.rolePermission.deleteMany({ where: { roleId } });
    expect(
      (
        await currentAccess(employeeId, platformId, {
          permission: "contacts.read",
        })
      ).allowed,
    ).toBe(false);
    await db.userPlatformAccess.update({
      where: { userId_platformId: { userId: employeeId, platformId } },
      data: { revokedAt: new Date() },
    });
    expect((await currentAccess(employeeId, platformId)).allowed).toBe(false);
  });
  it("global revocation permanently invalidates old versions after a fresh sign-in", async () => {
    const before = (
      await db.user.findUniqueOrThrow({ where: { id: employeeId } })
    ).securityVersion;
    await db.$transaction((tx) => revokeSessions(tx, employeeId));
    await (await auth.$context).internalAdapter.createSession(employeeId);
    expect(
      (await currentAccess(employeeId, platformId, { sessionVersion: before }))
        .reason,
    ).toBe("session_revoked");
  });
  it("prevents concurrent removal of the last active superadmin", async () => {
    const results = await Promise.allSettled([
      updateUser(adminId, adminId, { globalRole: "EMPLOYEE" }),
      updateUser(otherAdminId, otherAdminId, { status: "SUSPENDED" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.user.count({
        where: { globalRole: "SUPERADMIN", status: "ACTIVE" },
      }),
    ).toBe(1);
  });
  it("denies suspended admins and disabled platforms before full-access override", async () => {
    const admin = await db.user.findFirstOrThrow({
      where: { globalRole: "SUPERADMIN", status: "ACTIVE" },
    });
    await db.platform.update({
      where: { id: otherPlatformId },
      data: { enabled: false },
    });
    expect((await currentAccess(admin.id, otherPlatformId)).allowed).toBe(
      false,
    );
    await db.user.update({
      where: { id: admin.id },
      data: { status: "SUSPENDED" },
    });
    expect((await currentAccess(admin.id, platformId)).allowed).toBe(false);
  });
});
