import { describe, it, expect } from "vitest";
import {
  isSafeUrl,
  safeReturnPath,
  platformInput,
  inviteInput,
} from "../lib/validation";
describe("input boundaries", () => {
  it.each([
    "https://*.company.test/callback",
    "https://user:secret@company.test/callback",
    "https://company.test/#callback",
    "javascript:alert(1)",
    "http://company.test/callback",
  ])("rejects unsafe redirect %s", (value) =>
    expect(isSafeUrl(value)).toBe(false),
  );
  it("allows explicit HTTPS and loopback development", () => {
    expect(isSafeUrl("https://crm.company.test/callback")).toBe(true);
    expect(isSafeUrl("http://localhost:3001/callback")).toBe(true);
  });
  it.each([
    "//attacker.test",
    "https://attacker.test",
    "/\\attacker.test",
    "/%2f%2fattacker.test",
  ])("rejects unsafe return path %s", (value) =>
    expect(safeReturnPath(value)).toBe("/"),
  );
  it("does not permit mass assignment", () => {
    const parsed = platformInput.parse({
      name: "CRM",
      slug: "crm",
      description: "",
      icon: "briefcase",
      launchUrl: "https://crm.test/login",
      clientSecret: "leak",
    });
    expect(parsed).not.toHaveProperty("clientSecret");
  });
  it("does not accept arbitrary global roles", () =>
    expect(
      inviteInput.safeParse({
        name: "Test",
        email: "test@example.test",
        globalRole: "owner",
      }).success,
    ).toBe(false));
  const resource = {
    name: "Company handbook",
    slug: "handbook",
    description: "Policies",
    icon: "book",
    type: "LINK",
    launchUrl: "https://docs.company.test/handbook#leave",
  };
  it("allows document sections for resources without relaxing SSO URLs", () => {
    expect(platformInput.safeParse(resource).success).toBe(true);
    expect(platformInput.safeParse({ ...resource, type: "SSO" }).success).toBe(
      false,
    );
    expect(
      platformInput.parse({
        ...resource,
        type: undefined,
        launchUrl: "https://crm.test/login",
      }).type,
    ).toBe("SSO");
    expect(
      platformInput.safeParse({ ...resource, type: "unknown" }).success,
    ).toBe(false);
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "http://company.test/docs",
    "https://user:secret@company.test/docs",
    "https://*.company.test/docs",
  ])("rejects unsafe resource URL %s", (launchUrl) => {
    expect(platformInput.safeParse({ ...resource, launchUrl }).success).toBe(
      false,
    );
  });
});
