import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicDocs } from "../lib/public-docs";

describe("public documentation environment", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://private:password@db.test/app");
    vi.stubEnv("BETTER_AUTH_SECRET", "private-auth-secret-not-for-public-docs");
    vi.stubEnv("SMTP_PASSWORD", "private-mail-password");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reads the deployment at call time, including nondefault local ports", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100/");
    expect(getPublicDocs().discovery).toBe(
      "http://localhost:3100/api/auth/.well-known/openid-configuration",
    );
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://identity.company.test/");
    const docs = getPublicDocs();
    expect(docs.issuer).toBe("https://identity.company.test/api/auth");
    expect(docs.accessCheck).toBe(
      "https://identity.company.test/api/access/check",
    );
    for (const [key, value] of Object.entries(docs)) {
      if (key !== "name")
        expect(value).toMatch(/^https:\/\/identity\.company\.test(?:\/|$)/);
    }
  });

  it("exposes only public metadata and never environment secrets", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://identity.company.test");
    vi.stubEnv("PRODUCT_NAME", "Team Access");
    const docs = getPublicDocs();
    expect(docs.name).toBe("Team Access");
    expect(Object.keys(docs).sort()).toEqual(
      [
        "accessCheck",
        "authorize",
        "discovery",
        "introspect",
        "issuer",
        "jwks",
        "name",
        "origin",
        "security",
        "token",
        "userinfo",
      ].sort(),
    );
    expect(JSON.stringify(docs)).not.toContain("private");
  });

  it("rejects an invalid production origin rather than displaying incorrect URLs", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    expect(() => getPublicDocs()).toThrow("must use HTTPS");
  });
});
