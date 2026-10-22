import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { serializeSignedCookie } from "better-call";

// Exercise the actual provider and admin routes with production URL/cookie rules.
vi.hoisted(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_URL", "https://identity.test.example");
});
import { db } from "../lib/db";
import { auth } from "../lib/auth";
import { POST as adminPost } from "../app/api/admin/[...path]/route";

const origin = "https://identity.test.example";
let cookie: string, platformId: string;
const input = {
  name: "Development client",
  environment: "development",
  redirectUris: ["http://localhost:3001/callback"],
  postLogoutRedirectUris: ["http://localhost:3001/"],
};
function post(path: string[], data: unknown) {
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
beforeAll(async () => {
  if (!process.env.TEST_SCHEMA?.startsWith("test_access_"))
    throw new Error("Run through scripts/test-isolated.ts");
  const user = await db.user.create({
    data: {
      name: "Client environment admin",
      email: "client-environment-admin@test.example",
      status: "ACTIVE",
      emailVerified: true,
      globalRole: "SUPERADMIN",
      twoFactorEnabled: true,
    },
  });
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(user.id);
  cookie = (
    await serializeSignedCookie(
      context.authCookies.sessionToken.name,
      session.token,
      process.env.BETTER_AUTH_SECRET!,
    )
  ).split(";")[0];
  const platform = await db.platform.create({
    data: {
      name: "Client environments",
      slug: "client-environments",
      description: "",
      launchUrl: "https://app.test.example/login",
    },
  });
  platformId = platform.id;
});
afterAll(async () => {
  if (platformId) {
    const clients = await db.platformClient.findMany({ where: { platformId } });
    await db.platform.delete({ where: { id: platformId } });
    await db.oauthClient.deleteMany({
      where: {
        clientId: { in: clients.map((client) => client.oauthClientId) },
      },
    });
  }
  await db.user.deleteMany({
    where: { email: "client-environment-admin@test.example" },
  });
  await db.$disconnect();
  vi.unstubAllEnvs();
});

it("registers loopback clients on production SSO and preserves exact redirect matching", async () => {
  const response = await post(["platforms", platformId, "clients"], input);
  expect(response.status, await response.clone().text()).toBe(201);
  const { clientId } = await response.json();
  const client = await db.oauthClient.findUniqueOrThrow({
    where: { clientId },
  });
  expect(client.applicationType).toBe("native");
  expect(client.requirePKCE).toBe(true);
  expect(client.tokenEndpointAuthMethod).toBe("client_secret_basic");

  async function authorize(redirectUri: string) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid profile email",
      state: "test-state",
      nonce: "test-nonce",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    });
    return auth.handler(
      new Request(`${origin}/api/auth/oauth2/authorize?${params}`, {
        headers: { Cookie: cookie },
      }),
    );
  }
  const allowed = await authorize(input.redirectUris[0]);
  expect(allowed.status, await allowed.clone().text()).toBe(302);
  const redirect = new URL(allowed.headers.get("location")!);
  expect(`${redirect.origin}${redirect.pathname}`).toBe(input.redirectUris[0]);
  expect(redirect.searchParams.has("code")).toBe(true);
  for (const uri of [
    "http://localhost:3002/callback",
    "http://127.0.0.1:3001/callback",
    "http://localhost:3001/other",
  ]) {
    const rejected = await authorize(uri);
    expect(rejected.status).toBe(302);
    const errorUrl = new URL(rejected.headers.get("location")!);
    expect(errorUrl.origin).toBe(origin);
    expect(errorUrl.searchParams.get("error")).toBe("invalid_redirect");
    expect(errorUrl.searchParams.has("code")).toBe(false);
  }
});

it("rejects HTTP registration for staging and production, including logout-only HTTP", async () => {
  for (const environment of ["staging", "production"]) {
    for (const redirectUris of [
      input.redirectUris,
      ["https://app.test.example/callback"],
    ]) {
      const response = await post(["platforms", platformId, "clients"], {
        ...input,
        environment,
        redirectUris,
      });
      expect(response.status).toBe(400);
    }
  }
});

it("validates edits and updates provider metadata when moving between HTTPS and loopback", async () => {
  const production = {
    ...input,
    environment: "production",
    redirectUris: ["https://app.test.example/callback"],
    postLogoutRedirectUris: ["https://app.test.example/"],
  };
  const created = await post(["platforms", platformId, "clients"], production);
  expect(created.status).toBe(201);
  const { clientId } = await created.json();
  const registration = await db.platformClient.findUniqueOrThrow({
    where: { oauthClientId: clientId },
  });
  const path = ["clients", registration.id, "settings"];
  const changed = await post(path, input);
  expect(changed.status, await changed.clone().text()).toBe(200);
  expect(
    (await db.oauthClient.findUniqueOrThrow({ where: { clientId } }))
      .applicationType,
  ).toBe("native");
  for (const environment of ["staging", "production"]) {
    for (const redirectUris of [input.redirectUris, production.redirectUris]) {
      expect(
        (await post(path, { ...input, environment, redirectUris })).status,
      ).toBe(400);
      const unchanged = await db.platformClient.findUniqueOrThrow({
        where: { id: registration.id },
        include: { oauthClient: true },
      });
      expect(unchanged.environment).toBe("development");
      expect(unchanged.oauthClient.redirectUris).toEqual(input.redirectUris);
    }
  }
  expect((await post(path, production)).status).toBe(200);
  const updated = await db.platformClient.findUniqueOrThrow({
    where: { id: registration.id },
    include: { oauthClient: true },
  });
  expect(updated.environment).toBe("production");
  expect(updated.oauthClient.applicationType).toBe("web");
  expect(updated.oauthClient.redirectUris).toEqual(production.redirectUris);
  expect(updated.oauthClient.postLogoutRedirectUris).toEqual(
    production.postLogoutRedirectUris,
  );
});
