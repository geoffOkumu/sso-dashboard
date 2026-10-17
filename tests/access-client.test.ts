import { describe, expect, it, vi } from "vitest";
import { createAccessClient } from "../packages/access-client/src/index";
const session = {
  accessToken: "token",
  subject: "user",
  securityVersion: 2,
  sessionId: "session-1",
};
function fixture(cacheMs = 60_000) {
  let now = 1000;
  const decision = {
    allowed: true,
    reason: "granted",
    subject: "user",
    issuer: "https://identity.test/api/auth",
    platformId: "crm",
    role: "viewer",
    permissions: ["contacts.read"],
    superadmin: false,
    securityVersion: 2,
    expiresAt: 1_000_000,
  };
  const fetcher = vi.fn(async () => Response.json(decision));
  const client = createAccessClient({
    issuer: decision.issuer,
    clientId: "crm-client",
    clientSecret: "server-secret",
    endpoint: "https://identity.test/api/access/check",
    cacheMs,
    fetch: fetcher as typeof fetch,
    now: () => now,
  });
  return {
    client,
    decision,
    fetcher,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe("bounded access checks", () => {
  it("rejects viewer writes even when a successful read is cached", async () => {
    const f = fixture();
    await f.client.check(session, "contacts.read");
    await expect(f.client.check(session, "contacts.write")).rejects.toThrow(
      "permission_denied",
    );
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("caps cache at 60 seconds and observes revocation", async () => {
    const f = fixture(600000);
    await f.client.check(session);
    f.fetcher.mockImplementation(async () =>
      Response.json({ allowed: false }, { status: 403 }),
    );
    f.advance(59999);
    await f.client.check(session);
    f.advance(1);
    await expect(f.client.check(session)).rejects.toThrow(
      "session_or_access_denied",
    );
  });
  it("fails closed during a central outage after the cache expires", async () => {
    const f = fixture();
    await f.client.check(session);
    f.fetcher.mockRejectedValue(new Error("offline"));
    f.advance(60000);
    await expect(f.client.check(session)).rejects.toThrow(
      "authorization_unavailable",
    );
  });
  it("never uses cached access for sensitive operations", async () => {
    const f = fixture();
    await f.client.check(session);
    f.fetcher.mockImplementation(async () =>
      Response.json({}, { status: 403 }),
    );
    await expect(
      f.client.check(session, "contacts.read", true),
    ).rejects.toThrow();
  });
  it("separates sessions, tokens and versions in cache keys", async () => {
    const f = fixture();
    await f.client.check(session);
    await f.client.check({ ...session, sessionId: "session-2" });
    await f.client.check({ ...session, accessToken: "new-token" });
    expect(f.fetcher).toHaveBeenCalledTimes(3);
    await expect(
      f.client.check({ ...session, securityVersion: 1 }),
    ).rejects.toThrow();
  });
  it("rejects identity substitution by a wrong issuer or subject", async () => {
    const f = fixture();
    f.decision.subject = "another-user";
    await expect(f.client.check(session)).rejects.toThrow();
    f.decision.subject = "user";
    f.decision.issuer = "https://attacker.test";
    await expect(f.client.check(session)).rejects.toThrow();
  });
  it("rechecks permission changes after cache expiry", async () => {
    const f = fixture();
    await f.client.check(session, "contacts.read");
    f.decision.permissions = [];
    f.advance(60000);
    await expect(f.client.check(session, "contacts.read")).rejects.toThrow(
      "permission_denied",
    );
  });
  it("does not extend a cached decision past token expiration", async () => {
    const f = fixture();
    f.decision.expiresAt = 1500;
    await f.client.check(session);
    f.advance(501);
    await expect(f.client.check(session)).rejects.toThrow();
  });
});
