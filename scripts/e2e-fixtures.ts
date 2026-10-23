import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { serializeSignedCookie } from "better-call";
import { db } from "../lib/db";
import { auth } from "../lib/auth";
if (!process.env.TEST_SCHEMA?.startsWith("test_access_"))
  throw new Error("Use the isolated test runner");
const password = randomBytes(24).toString("base64url");
const users: Record<string, { id: string; email: string }> = {};
for (const [key, globalRole, mfa] of [
  ["admin", "SUPERADMIN", true],
  ["enrollment", "SUPERADMIN", false],
  ["viewer", "EMPLOYEE", false],
  ["editor", "EMPLOYEE", false],
  ["renewal", "EMPLOYEE", false],
  ["unassigned", "EMPLOYEE", false],
] as const) {
  const user = await db.user.create({
    data: {
      name: `Test ${key}`,
      email: `${key}@company.test`,
      emailVerified: true,
      status: "ACTIVE",
      globalRole,
      twoFactorEnabled: mfa,
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
  users[key] = { id: user.id, email: user.email };
}
const session = await (
  await auth.$context
).internalAdapter.createSession(users.admin.id);
const adminCookie = (
  await serializeSignedCookie(
    "company-access.session_token",
    session.token,
    process.env.BETTER_AUTH_SECRET!,
  )
).split(";")[0];
const platforms: Record<
  string,
  {
    id: string;
    roles: Record<string, string>;
    permissions: string[];
    clientId: string;
    clientSecret: string;
  }
> = {};
for (const [kind, port] of [
  ["crm", 3101],
  ["analytics", 3102],
] as const) {
  const platform = await db.platform.create({
    data: {
      name: kind === "crm" ? "Customer CRM" : "Analytics",
      slug: kind,
      description:
        kind === "crm"
          ? "Customers and contacts in one place."
          : "Reports and dashboards for your team.",
      launchUrl: `http://localhost:${port}/login`,
      icon: kind === "crm" ? "briefcase" : "chart",
    },
  });
  const keys =
    kind === "crm"
      ? ["contacts.read", "contacts.write", "contacts.delete"]
      : ["reports.read", "reports.export", "dashboards.manage"];
  const permissions = [];
  for (const key of keys)
    permissions.push(
      await db.platformPermission.create({
        data: { platformId: platform.id, key, description: key },
      }),
    );
  const roles: Record<string, string> = {};
  for (const [index, key] of ["viewer", "editor", "admin"].entries()) {
    const role = await db.platformRole.create({
      data: { platformId: platform.id, key, name: key },
    });
    roles[key] = role.id;
    await db.rolePermission.createMany({
      data: permissions.slice(0, index + 1).map((p) => ({
        platformId: platform.id,
        roleId: role.id,
        permissionId: p.id,
      })),
    });
  }
  for (const key of ["viewer", "editor", "renewal"])
    await db.userPlatformAccess.create({
      data: {
        userId: users[key].id,
        platformId: platform.id,
        roleId: roles[key === "renewal" ? "editor" : key],
      },
    });
  const client = await auth.api.adminCreateOAuthClient({
    headers: new Headers({ Cookie: adminCookie }),
    body: {
      client_name: `${kind} test`,
      redirect_uris: [`http://localhost:${port}/callback`],
      post_logout_redirect_uris: [`http://localhost:${port}/`],
      scope: "openid profile email offline_access",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
      require_pkce: true,
      skip_consent: true,
      enable_end_session: true,
      application_type: "native",
    },
  });
  await db.platformClient.create({
    data: {
      platformId: platform.id,
      oauthClientId: client.client_id,
      name: `${kind} test`,
      environment: "development",
    },
  });
  platforms[kind] = {
    id: platform.id,
    roles,
    permissions: permissions.map((p) => p.id),
    clientId: client.client_id,
    clientSecret: client.client_secret!,
  };
}
mkdirSync(".generated", { recursive: true });
writeFileSync(
  ".generated/e2e-fixture.json",
  JSON.stringify({ password, users, platforms, adminCookie }),
  { mode: 0o600 },
);
await db.$disconnect();
console.log("Isolated browser fixtures and provider-generated clients ready.");
