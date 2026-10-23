import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { serializeSignedCookie } from "better-call";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { revokeSessions } from "../lib/admin";
import { POST as checkAccess } from "../app/api/access/check/route";

const origin = process.env.BETTER_AUTH_URL!;
const issuer = `${origin}/api/auth`;
let adminId: string, platformId: string, roleId: string;
let clientId: string, clientSecret: string;
let userId: string, sessionId: string, refreshToken: string;
const basic = () =>
  `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64")}`;
async function requestToken(
  body: Record<string, string>,
  authorization = basic(),
) {
  return auth.handler(
    new Request(`${issuer}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authorization,
      },
      body: new URLSearchParams(body),
    }),
  );
}
const refresh = (token = refreshToken, scope?: string) =>
  requestToken({
    grant_type: "refresh_token",
    refresh_token: token,
    ...(scope ? { scope } : {}),
  });

beforeAll(async () => {
  if (!process.env.TEST_SCHEMA?.startsWith("test_access_"))
    throw new Error("Use the isolated test harness");
  const admin = await db.user.create({
    data: {
      name: "Refresh Admin",
      email: "refresh-admin@test.example",
      emailVerified: true,
      status: "ACTIVE",
      globalRole: "SUPERADMIN",
      twoFactorEnabled: true,
    },
  });
  adminId = admin.id;
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(adminId);
  const cookie = (
    await serializeSignedCookie(
      context.authCookies.sessionToken.name,
      session.token,
      process.env.BETTER_AUTH_SECRET!,
    )
  ).split(";")[0];
  const platform = await db.platform.create({
    data: {
      name: "Refresh test",
      slug: "refresh-test",
      description: "",
      launchUrl: "http://localhost:3199/login",
    },
  });
  platformId = platform.id;
  roleId = (
    await db.platformRole.create({
      data: { platformId, key: "viewer", name: "Viewer" },
    })
  ).id;
  const client = await auth.api.adminCreateOAuthClient({
    headers: new Headers({ Cookie: cookie }),
    body: {
      client_name: "Refresh test",
      redirect_uris: ["http://localhost:3199/callback"],
      scope: "openid profile email offline_access",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
      application_type: "native",
      require_pkce: true,
      skip_consent: true,
    },
  });
  clientId = client.client_id;
  clientSecret = client.client_secret!;
  await db.platformClient.create({
    data: {
      platformId,
      oauthClientId: clientId,
      name: "Refresh test",
      environment: "DEVELOPMENT",
    },
  });
});
beforeEach(async () => {
  // This serial suite uses one IP; isolate provider throttling between cases.
  await db.rateLimit.deleteMany();
  userId = (
    await db.user.create({
      data: {
        name: "Refresh user",
        email: `${randomBytes(8).toString("hex")}@refresh.test`,
        emailVerified: true,
        status: "ACTIVE",
      },
    })
  ).id;
  await db.userPlatformAccess.create({ data: { userId, platformId, roleId } });
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  sessionId = session.id;
  const cookie = (
    await serializeSignedCookie(
      context.authCookies.sessionToken.name,
      session.token,
      process.env.BETTER_AUTH_SECRET!,
    )
  ).split(";")[0];
  const verifier = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "http://localhost:3199/callback",
    response_type: "code",
    scope: "openid profile email offline_access",
    state: randomBytes(16).toString("hex"),
    nonce: randomBytes(16).toString("hex"),
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  const authorization = await auth.handler(
    new Request(`${issuer}/oauth2/authorize?${params}`, {
      headers: { Cookie: cookie },
    }),
  );
  expect(authorization.status).toBe(302);
  const callback = new URL(authorization.headers.get("location")!);
  expect(callback.searchParams.has("code")).toBe(true);
  const response = await requestToken({
    grant_type: "authorization_code",
    code: callback.searchParams.get("code")!,
    redirect_uri: "http://localhost:3199/callback",
    code_verifier: verifier,
  });
  expect(response.status).toBe(200);
  const tokens = await response.json();
  expect(typeof tokens.refresh_token).toBe("string");
  refreshToken = tokens.refresh_token;
});
afterEach(async () => {
  await db.user.deleteMany({ where: { id: userId } });
  await db.platform.update({
    where: { id: platformId },
    data: { enabled: true },
  });
  await db.platformClient.update({
    where: { oauthClientId: clientId },
    data: { enabled: true },
  });
  await db.oauthClient.update({
    where: { clientId },
    data: { disabled: false },
  });
});
afterAll(async () => {
  if (platformId) await db.platform.delete({ where: { id: platformId } });
  if (clientId) await db.oauthClient.delete({ where: { clientId } });
  if (adminId) await db.user.delete({ where: { id: adminId } });
  await db.$disconnect();
});

describe("provider session-bound refresh", () => {
  it("rotates tokens and returns separate token and central deadlines without extending the session", async () => {
    const before = await db.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    const response = await refresh();
    expect(response.status).toBe(200);
    const tokens = await response.json();
    expect(tokens.expires_in).toBe(900);
    expect(tokens.refresh_token !== refreshToken).toBe(true);
    const check = await checkAccess(
      new Request(`${origin}/api/access/check`, {
        method: "POST",
        headers: { Authorization: basic(), "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokens.access_token }),
      }),
    );
    expect(check.status).toBe(200);
    const decision = await check.json();
    expect(decision.subject).toBe(userId);
    expect(decision.sessionExpiresAt).toBe(before.expiresAt.getTime());
    expect(decision.expiresAt).toBeLessThan(decision.sessionExpiresAt);
    expect(
      (await db.session.findUniqueOrThrow({ where: { id: sessionId } }))
        .expiresAt,
    ).toEqual(before.expiresAt);
  });
  it("rejects reuse of an old token and invalidates its replacement", async () => {
    const response = await refresh();
    expect(response.status).toBe(200);
    const replacement = (await response.json()).refresh_token;
    expect((await refresh()).status).toBe(400);
    expect((await refresh(replacement)).status).toBe(400);
  });
  it.each([
    "expired session",
    "deleted session",
    "generation mismatch",
    "suspended user",
    "disabled platform",
    "disabled registration",
    "disabled provider client",
    "expired assignment",
    "revoked assignment",
    "missing MFA",
  ])("denies renewal for %s, including without openid", async (scenario) => {
    if (scenario === "expired session")
      await db.session.update({
        where: { id: sessionId },
        data: { expiresAt: new Date(0) },
      });
    if (scenario === "deleted session")
      await db.session.delete({ where: { id: sessionId } });
    if (scenario === "generation mismatch")
      await db.user.update({
        where: { id: userId },
        data: { securityVersion: { increment: 1 } },
      });
    if (scenario === "suspended user")
      await db.user.update({
        where: { id: userId },
        data: { status: "SUSPENDED" },
      });
    if (scenario === "disabled platform")
      await db.platform.update({
        where: { id: platformId },
        data: { enabled: false },
      });
    if (scenario === "disabled registration")
      await db.platformClient.update({
        where: { oauthClientId: clientId },
        data: { enabled: false },
      });
    if (scenario === "disabled provider client")
      await db.oauthClient.update({
        where: { clientId },
        data: { disabled: true },
      });
    if (scenario === "expired assignment")
      await db.userPlatformAccess.updateMany({
        where: { userId },
        data: { expiresAt: new Date(0) },
      });
    if (scenario === "revoked assignment")
      await db.userPlatformAccess.deleteMany({ where: { userId } });
    if (scenario === "missing MFA")
      await db.user.update({
        where: { id: userId },
        data: { globalRole: "SUPERADMIN", twoFactorEnabled: false },
      });
    const response = await refresh(refreshToken, "profile");
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect((await response.json()).access_token).toBeUndefined();
    expect(await db.oauthRefreshToken.count({ where: { userId } })).toBe(1);
  });
  it("cannot revive old refresh tokens after global logout and a new central login", async () => {
    await db.$transaction((tx) => revokeSessions(tx, userId));
    await (await auth.$context).internalAdapter.createSession(userId);
    expect((await refresh()).status).toBe(400);
  });
  it("rejects incorrect client credentials without consuming the token", async () => {
    const response = await requestToken(
      { grant_type: "refresh_token", refresh_token: refreshToken },
      `Basic ${Buffer.from(`${clientId}:wrong`).toString("base64")}`,
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await refresh()).status).toBe(200);
  });
  it("rejects a refresh token bound to another user's central session", async () => {
    const other = await (
      await auth.$context
    ).internalAdapter.createSession(adminId);
    await db.oauthRefreshToken.updateMany({
      where: { userId },
      data: { sessionId: other.id },
    });
    expect((await refresh()).status).toBe(400);
  });
  it("rejects expired refresh tokens even with a valid central session", async () => {
    await db.oauthRefreshToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(0) },
    });
    expect((await refresh()).status).toBe(400);
  });
  it("upgrades existing client scopes without changing credentials or duplicating grants", async () => {
    const original = await db.oauthClient.update({
      where: { clientId },
      data: {
        scopes: ["openid", "profile", "email"],
        grantTypes: ["authorization_code"],
      },
    });
    const sql = readFileSync(
      "prisma/migrations/202610230001_session_refresh/migration.sql",
      "utf8",
    );
    await db.$executeRawUnsafe(sql);
    await db.$executeRawUnsafe(sql);
    const updated = await db.oauthClient.findUniqueOrThrow({
      where: { clientId },
    });
    expect(updated.scopes).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
    ]);
    expect(updated.grantTypes).toEqual(["authorization_code", "refresh_token"]);
    expect(updated.clientSecret === original.clientSecret).toBe(true);
    expect(updated.redirectUris).toEqual(original.redirectUris);
  });
});
