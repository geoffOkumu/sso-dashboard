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
});
