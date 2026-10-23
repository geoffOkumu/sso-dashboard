import { describe, expect, it, vi } from "vitest";
import {
  createSessionRenewer,
  type ToolSession,
} from "../packages/demo-runtime/src/session";
import { AccessDenied } from "../packages/access-client/src/index";

function fixture() {
  const now = 100_000;
  let stored: ToolSession | undefined = {
    id: "app-session",
    issuer: "https://identity.test/api/auth",
    subject: "user",
    name: "User",
    accessToken: "expired-access",
    refreshToken: "refresh-1",
    securityVersion: 2,
    accessTokenExpires: now - 1,
    expires: now + 28_800_000,
  };
  const decision = {
    allowed: true,
    reason: "granted",
    issuer: stored.issuer,
    subject: stored.subject,
    securityVersion: 2,
    permissions: ["contacts.write"],
    role: "editor",
    platformId: "crm",
    superadmin: false,
    expiresAt: now + 900_000,
    sessionExpiresAt: stored.expires,
  };
  const refresh = vi.fn(async () => ({
    accessToken: "access-2",
    refreshToken: "refresh-2",
    expiresIn: 900,
  }));
  const validate = vi.fn(async () => decision);
  const remove = vi.fn(() => {
    stored = undefined;
  });
  const get = createSessionRenewer({
    issuer: stored.issuer,
    now: () => now,
    load: () => stored,
    refresh,
    validate,
    remove,
    save: (previous, next) => {
      if (!stored || stored.refreshToken !== previous.refreshToken)
        return false;
      stored = next;
      return true;
    },
  });
  return {
    get,
    refresh,
    validate,
    remove,
    decision,
    now,
    stored: () => stored,
    edit: (change: Partial<ToolSession>) => Object.assign(stored!, change),
  };
}

describe("automatic app-session renewal", () => {
  it("renews an expired token before continuing under the same app session", async () => {
    const f = fixture();
    const session = await f.get("app-session");
    expect(session).toMatchObject({
      id: "app-session",
      accessToken: "access-2",
      refreshToken: "refresh-2",
      securityVersion: 2,
    });
    expect(session.accessTokenExpires).toBe(f.now + 900_000);
    expect(session.expires).toBe(f.decision.sessionExpiresAt);
    expect(f.validate).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-2" }),
    );
  });
  it("shares one rotation across concurrent requests", async () => {
    const f = fixture();
    const sessions = await Promise.all(
      Array.from({ length: 10 }, () => f.get("app-session")),
    );
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(new Set(sessions.map((s) => s.refreshToken))).toEqual(
      new Set(["refresh-2"]),
    );
    await f.get("app-session");
    expect(f.refresh).toHaveBeenCalledTimes(1);
  });
  it("renews within 60 seconds of expiry but leaves a fresh token alone", async () => {
    const f = fixture();
    f.edit({ accessTokenExpires: f.now + 60_001 });
    await f.get("app-session");
    expect(f.refresh).not.toHaveBeenCalled();
    f.edit({ accessTokenExpires: f.now + 60_000 });
    await f.get("app-session");
    expect(f.refresh).toHaveBeenCalledTimes(1);
  });
  it.each([
    "subject",
    "issuer",
    "securityVersion",
    "allowed",
    "sessionExpiresAt",
  ] as const)(
    "rejects a changed or invalid %s after refresh",
    async (field) => {
      const f = fixture();
      Object.assign(f.decision, {
        [field]:
          field === "securityVersion"
            ? 3
            : field === "allowed"
              ? false
              : field === "sessionExpiresAt"
                ? NaN
                : "other",
      });
      await expect(f.get("app-session")).rejects.toBeInstanceOf(AccessDenied);
      expect(f.stored()).toBeUndefined();
    },
  );
  it("never recreates a session when local logout races with refresh", async () => {
    const f = fixture();
    f.validate.mockImplementationOnce(async () => {
      f.remove();
      return f.decision;
    });
    await expect(f.get("app-session")).rejects.toThrow("session_expired");
    expect(f.stored()).toBeUndefined();
  });
  it("fails closed on an uncertain response and never retries the consumed refresh token", async () => {
    const f = fixture();
    f.refresh.mockRejectedValueOnce(new Error("network failure"));
    await expect(f.get("app-session")).rejects.toThrow(
      "authorization_unavailable",
    );
    await expect(f.get("app-session")).rejects.toThrow("session_expired");
    expect(f.refresh).toHaveBeenCalledTimes(1);
  });
  it("does not refresh after the known central deadline", async () => {
    const f = fixture();
    f.edit({ expires: f.now });
    await expect(f.get("app-session")).rejects.toThrow("session_expired");
    expect(f.refresh).not.toHaveBeenCalled();
  });
  it("allows legacy sessions until token expiry and then requires login", async () => {
    const f = fixture();
    f.edit({ refreshToken: null, accessTokenExpires: f.now + 90_000 });
    await f.get("app-session");
    f.edit({ accessTokenExpires: f.now - 1 });
    await expect(f.get("app-session")).rejects.toThrow("session_expired");
    expect(f.refresh).not.toHaveBeenCalled();
  });
});
