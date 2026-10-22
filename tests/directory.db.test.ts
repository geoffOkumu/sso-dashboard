import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializeSignedCookie } from "better-call";
import { db } from "../lib/db";
import { auth } from "../lib/auth";
import { GET as meGet } from "../app/api/me/route";
import {
  POST as adminPost,
  GET as adminGet,
} from "../app/api/admin/[...path]/route";

const origin = "http://localhost:3100";
let adminCookie: string, employeeCookie: string, employeeId: string;
const input = {
  name: "Company handbook",
  slug: "directory-handbook",
  description: "Company policies",
  icon: "book",
  type: "LINK",
  launchUrl: "https://docs.company.test/handbook#leave",
  enabled: true,
  displayOrder: 0,
};
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
async function post(path: string[], data: unknown, cookie = adminCookie) {
  return adminPost(
    new Request(`${origin}/api/admin/${path.join("/")}`, {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }),
    { params: Promise.resolve({ path }) },
  );
}
async function me(cookie = employeeCookie) {
  return meGet(
    new Request(`${origin}/api/me`, { headers: { Cookie: cookie } }),
  );
}
beforeAll(async () => {
  if (!process.env.TEST_SCHEMA?.startsWith("test_access_"))
    throw new Error("Run through scripts/test-isolated.ts");
  const admin = await db.user.create({
    data: {
      name: "Directory admin",
      email: "directory-admin@test.example",
      status: "ACTIVE",
      emailVerified: true,
      globalRole: "SUPERADMIN",
      twoFactorEnabled: true,
    },
  });
  const employee = await db.user.create({
    data: {
      name: "Directory employee",
      email: "directory-employee@test.example",
      status: "ACTIVE",
      emailVerified: true,
    },
  });
  employeeId = employee.id;
  adminCookie = await cookieFor(admin.id);
  employeeCookie = await cookieFor(employee.id);
});
afterAll(async () => {
  await db.platform.deleteMany({ where: { slug: input.slug } });
  await db.user.deleteMany({
    where: {
      email: {
        in: ["directory-admin@test.example", "directory-employee@test.example"],
      },
    },
  });
  await db.$disconnect();
});
describe("company resource directory", () => {
  it("creates, lists, edits and hides a resource without assignments or SSO setup", async () => {
    expect((await post(["platforms"], input, employeeCookie)).status).toBe(403);
    const response = await post(["platforms"], input);
    expect(response.status).toBe(201);
    const resource = await response.json();
    const apps = (await (await me()).json()).apps;
    expect(apps).toContainEqual(
      expect.objectContaining({
        id: resource.id,
        type: "LINK",
        access: null,
        launchUrl: input.launchUrl,
      }),
    );
    expect(apps.every((app: { type: string }) => app.type === "LINK")).toBe(
      true,
    );
    expect(
      await db.platformClient.count({ where: { platformId: resource.id } }),
    ).toBe(0);
    expect(
      await db.platformRole.count({ where: { platformId: resource.id } }),
    ).toBe(0);
    const listing = await adminGet(
      new Request(`${origin}/api/admin/platforms?type=SSO`, {
        headers: { Cookie: adminCookie },
      }),
      { params: Promise.resolve({ path: ["platforms"] }) },
    );
    expect(
      (await listing.json()).items.some(
        (p: { id: string }) => p.id === resource.id,
      ),
    ).toBe(false);
    for (const action of ["roles", "permissions", "clients"]) {
      expect((await post(["platforms", resource.id, action], {})).status).toBe(
        400,
      );
    }
    expect(
      (
        await post(["platforms", resource.id], {
          ...input,
          type: "SSO",
          launchUrl: "https://docs.company.test",
        })
      ).status,
    ).toBe(400);
    const updated = {
      ...input,
      name: "Updated handbook",
      launchUrl: "https://docs.company.test/new#policies",
      type: undefined,
    };
    expect((await post(["platforms", resource.id], updated)).status).toBe(200);
    expect((await (await me()).json()).apps).toContainEqual(
      expect.objectContaining({
        id: resource.id,
        name: updated.name,
        type: "LINK",
        launchUrl: updated.launchUrl,
      }),
    );
    expect(
      (await post(["platforms", resource.id], { ...updated, enabled: false }))
        .status,
    ).toBe(200);
    for (const cookie of [employeeCookie, adminCookie]) {
      expect(
        (await (await me(cookie)).json()).apps.some(
          (p: { id: string }) => p.id === resource.id,
        ),
      ).toBe(false);
    }
    expect(
      (await post(["platforms", resource.id], { ...updated, enabled: true }))
        .status,
    ).toBe(200);
    expect(
      (await (await me()).json()).apps.some(
        (p: { id: string }) => p.id === resource.id,
      ),
    ).toBe(true);
    expect(
      await db.auditLog.count({
        where: { platformId: resource.id, action: "platform.created" },
      }),
    ).toBe(1);
    expect((await me("")).status).toBe(401);
    await db.user.update({
      where: { id: employeeId },
      data: { status: "SUSPENDED" },
    });
    expect((await me()).status).toBe(401);
  });
});
