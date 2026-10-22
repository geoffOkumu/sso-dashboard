import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { serializeSignedCookie } from "better-call";
import { db } from "../lib/db";
import { auth } from "../lib/auth";
import { currentAccess } from "../lib/access";
import { DELETE as adminDelete } from "../app/api/admin/[...path]/route";

const origin = "http://localhost:3100";
let adminId: string, employeeId: string;
let adminCookie: string, employeeCookie: string, noMfaCookie: string;

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
function remove(path: string[], cookie = adminCookie, requestOrigin = origin) {
  return adminDelete(
    new Request(`${origin}/api/admin/${path.join("/")}`, {
      method: "DELETE",
      headers: { Origin: requestOrigin, Cookie: cookie },
    }),
    { params: Promise.resolve({ path }) },
  );
}
beforeAll(async () => {
  if (!process.env.TEST_SCHEMA?.startsWith("test_access_"))
    throw new Error("Run through scripts/test-isolated.ts");
  const users = await Promise.all(
    [
      {
        name: "Deletion admin",
        globalRole: "SUPERADMIN",
        twoFactorEnabled: true,
      },
      {
        name: "Deletion employee",
        globalRole: "EMPLOYEE",
        twoFactorEnabled: false,
      },
      {
        name: "Deletion admin without MFA",
        globalRole: "SUPERADMIN",
        twoFactorEnabled: false,
      },
    ].map((user, index) =>
      db.user.create({
        data: {
          ...user,
          email: `deletion-${index}@test.example`,
          status: "ACTIVE",
          emailVerified: true,
        },
      }),
    ),
  );
  [adminId, employeeId] = users.map((user) => user.id);
  [adminCookie, employeeCookie, noMfaCookie] = await Promise.all(
    users.map((user) => cookieFor(user.id)),
  );
});
afterAll(() => db.$disconnect());

it("rejects unauthorized deletes and invalid paths without removing the platform", async () => {
  const platform = await db.platform.create({
    data: {
      name: "Protected",
      slug: "deletion-protected",
      description: "Protected",
      launchUrl: "https://example.test",
    },
  });
  const path = ["platforms", platform.id];
  expect((await remove(path, "")).status).toBe(401);
  expect((await remove(path, employeeCookie)).status).toBe(403);
  expect((await remove(path, noMfaCookie)).status).toBe(403);
  expect((await remove(path, adminCookie, "https://other.test")).status).toBe(
    403,
  );
  expect((await remove(["platforms"])).status).toBe(404);
  expect((await remove([...path, "clients"])).status).toBe(404);
  expect((await remove(["users", employeeId])).status).toBe(404);
  expect((await remove(["platforms", "invalid"])).status).toBe(400);
  expect(
    await db.platform.findUnique({ where: { id: platform.id } }),
  ).not.toBeNull();
});

it("deletes SSO dependencies, preserves other platforms and invitations, and retains audit history", async () => {
  const invitation = await db.invitation.create({
    data: {
      email: "deletion-invite@test.example",
      name: "Invitee",
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  async function fixture(slug: string) {
    const platform = await db.platform.create({
      data: {
        name: slug,
        slug,
        description: slug,
        launchUrl: "https://example.test",
      },
    });
    const platformId = platform.id;
    const role = await db.platformRole.create({
      data: { platformId, key: "viewer", name: "Viewer" },
    });
    const permission = await db.platformPermission.create({
      data: { platformId, key: "read", description: "Read" },
    });
    await db.rolePermission.create({
      data: { platformId, roleId: role.id, permissionId: permission.id },
    });
    await db.userPlatformAccess.create({
      data: { platformId, roleId: role.id, userId: employeeId },
    });
    await db.invitationGrant.create({
      data: { platformId, roleId: role.id, invitationId: invitation.id },
    });
    const clientId = randomUUID();
    await db.oauthClient.create({
      data: {
        clientId,
        redirectUris: ["https://example.test/callback"],
        postLogoutRedirectUris: [],
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
      },
    });
    await db.platformClient.create({
      data: {
        platformId,
        oauthClientId: clientId,
        name: slug,
        environment: "test",
      },
    });
    const tokenData = {
      clientId,
      userId: employeeId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      scopes: ["openid"],
    };
    const refresh = await db.oauthRefreshToken.create({
      data: { ...tokenData, token: randomUUID() },
    });
    await db.oauthAccessToken.create({
      data: { ...tokenData, refreshId: refresh.id, token: randomUUID() },
    });
    await db.oauthConsent.create({
      data: {
        clientId,
        userId: employeeId,
        scopes: ["openid"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await db.auditLog.create({
      data: {
        actorId: adminId,
        action: "platform.created",
        platformId,
        targetId: platformId,
      },
    });
    return { platformId, clientId };
  }
  const target = await fixture("deletion-target"),
    other = await fixture("deletion-other");
  expect((await currentAccess(employeeId, target.platformId)).allowed).toBe(
    true,
  );
  const response = await remove(["platforms", target.platformId]);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true });
  expect((await currentAccess(employeeId, target.platformId)).allowed).toBe(
    false,
  );
  expect(
    await db.platform.findUnique({ where: { id: target.platformId } }),
  ).toBeNull();
  for (const { platformId, clientId } of [target, other]) {
    const count = platformId === target.platformId ? 0 : 1;
    expect(await db.platformRole.count({ where: { platformId } })).toBe(count);
    expect(await db.platformPermission.count({ where: { platformId } })).toBe(
      count,
    );
    expect(await db.rolePermission.count({ where: { platformId } })).toBe(
      count,
    );
    expect(await db.userPlatformAccess.count({ where: { platformId } })).toBe(
      count,
    );
    expect(await db.invitationGrant.count({ where: { platformId } })).toBe(
      count,
    );
    expect(await db.platformClient.count({ where: { platformId } })).toBe(
      count,
    );
    expect(await db.oauthClient.count({ where: { clientId } })).toBe(count);
    expect(await db.oauthRefreshToken.count({ where: { clientId } })).toBe(
      count,
    );
    expect(await db.oauthAccessToken.count({ where: { clientId } })).toBe(
      count,
    );
    expect(await db.oauthConsent.count({ where: { clientId } })).toBe(count);
  }
  expect(
    await db.invitation.findUnique({ where: { id: invitation.id } }),
  ).not.toBeNull();
  expect((await currentAccess(employeeId, other.platformId)).allowed).toBe(
    true,
  );
  expect(
    await db.auditLog.findMany({ where: { platformId: target.platformId } }),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ action: "platform.created" }),
      expect.objectContaining({
        action: "platform.deleted",
        actorId: adminId,
        details: {
          name: "deletion-target",
          slug: "deletion-target",
          type: "SSO",
        },
      }),
    ]),
  );
  expect((await remove(["platforms", target.platformId])).status).toBe(404);
});

it("deletes directory resources without SSO dependencies", async () => {
  const platform = await db.platform.create({
    data: {
      name: "Handbook",
      slug: "deletion-handbook",
      description: "Policies",
      launchUrl: "https://example.test/handbook",
      type: "LINK",
    },
  });
  expect((await remove(["platforms", platform.id])).status).toBe(200);
  expect(
    await db.platform.findUnique({ where: { id: platform.id } }),
  ).toBeNull();
});
