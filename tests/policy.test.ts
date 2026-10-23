import { describe, expect, it } from "vitest";
import { decideAccess, type PolicyInput } from "../lib/policy";
const base: PolicyInput = {
  user: {
    id: "employee",
    status: "ACTIVE",
    globalRole: "EMPLOYEE",
    securityVersion: 3,
  },
  platform: { id: "crm", enabled: true },
  assignment: {
    revokedAt: null,
    expiresAt: null,
    role: {
      key: "viewer",
      permissions: [{ permission: { key: "contacts.read" } }],
    },
  },
};
describe("authoritative platform policy", () => {
  it.each(["EMPLOYEE", "SUPERADMIN"])(
    "requires a password change before granting %s access",
    (globalRole) => {
      expect(
        decideAccess({
          ...base,
          user: {
            ...base.user!,
            globalRole,
            twoFactorEnabled: true,
            passwordChangeRequired: true,
          },
        }).reason,
      ).toBe("password_change_required");
    },
  );
  it.each(["EMPLOYEE", "SUPERADMIN"])(
    "does not grant SSO authorization for directory links to %s",
    (globalRole) => {
      expect(
        decideAccess({
          ...base,
          user: { ...base.user!, globalRole, twoFactorEnabled: true },
          platform: { id: "handbook", enabled: true, type: "LINK" },
        }).reason,
      ).toBe("directory_resource");
    },
  );
  it("defaults to deny without identity or assignment", () => {
    expect(decideAccess({ ...base, user: null }).allowed).toBe(false);
    expect(decideAccess({ ...base, assignment: null }).allowed).toBe(false);
  });
  it("allows only role permissions", () => {
    expect(decideAccess({ ...base, permission: "contacts.read" }).allowed).toBe(
      true,
    );
    expect(
      decideAccess({ ...base, permission: "contacts.delete" }).allowed,
    ).toBe(false);
  });
  it("grants a superadmin a newly created platform without assignments", () => {
    expect(
      decideAccess({
        ...base,
        assignment: null,
        platform: { id: "new", enabled: true },
        user: {
          ...base.user!,
          globalRole: "SUPERADMIN",
          twoFactorEnabled: true,
        },
        permission: "future.permission",
      }).allowed,
    ).toBe(true);
  });
  it.each(["INVITED", "SUSPENDED"])(
    "denies %s users including superadmins",
    (status) => {
      expect(
        decideAccess({
          ...base,
          user: {
            ...base.user!,
            status,
            globalRole: "SUPERADMIN",
            twoFactorEnabled: true,
          },
        }).allowed,
      ).toBe(false);
    },
  );
  it("denies disabled platforms and clients before the superadmin override", () => {
    const user = {
      ...base.user!,
      globalRole: "SUPERADMIN",
      twoFactorEnabled: true,
    };
    expect(
      decideAccess({ ...base, user, platform: { id: "crm", enabled: false } })
        .allowed,
    ).toBe(false);
    expect(decideAccess({ ...base, user, clientEnabled: false }).allowed).toBe(
      false,
    );
  });
  it("requires superadmin MFA", () =>
    expect(
      decideAccess({
        ...base,
        user: { ...base.user!, globalRole: "SUPERADMIN" },
      }).reason,
    ).toBe("mfa_required"));
  it("uses deterministic assignment expiry and denies revoked grants", () => {
    expect(
      decideAccess({
        ...base,
        now: new Date("2030-01-01"),
        assignment: { ...base.assignment!, expiresAt: new Date("2030-01-01") },
      }).allowed,
    ).toBe(false);
    expect(
      decideAccess({
        ...base,
        assignment: { ...base.assignment!, revokedAt: new Date() },
      }).allowed,
    ).toBe(false);
  });
  it("never revives a globally revoked session", () => {
    expect(decideAccess({ ...base, sessionVersion: 2 }).reason).toBe(
      "session_revoked",
    );
    expect(decideAccess({ ...base, sessionVersion: 3 }).allowed).toBe(true);
  });
});
