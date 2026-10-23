import { afterEach, describe, it, expect, vi } from "vitest";
import {
  isSafeUrl,
  safeReturnPath,
  platformInput,
  inviteInput,
  clientInput,
  createUserInput,
} from "../lib/validation";
describe("input boundaries", () => {
  it("requires a bounded password and a boolean first-use flag for direct creation", () => {
    const input = {
      name: "Test User",
      email: "TEST@example.test",
      password: "a".repeat(12),
    };
    expect(createUserInput.parse(input)).toMatchObject({
      email: "test@example.test",
      passwordChangeRequired: false,
    });
    for (const password of [undefined, "", "a".repeat(11), "a".repeat(129)])
      expect(createUserInput.safeParse({ ...input, password }).success).toBe(
        false,
      );
    expect(
      createUserInput.safeParse({ ...input, passwordChangeRequired: "true" })
        .success,
    ).toBe(false);
    expect(
      createUserInput.safeParse({ ...input, emailVerified: true }).success,
    ).toBe(false);
  });
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

describe.each(["development", "production"])(
  "client URLs on a %s SSO server",
  (serverEnvironment) => {
    afterEach(() => vi.unstubAllEnvs());
    const input = {
      name: "Test client",
      environment: "development",
      redirectUris: ["https://app.example.test/callback"],
      postLogoutRedirectUris: ["https://app.example.test/"],
    };

    it.each(["development", "staging", "production"])(
      "enforces %s client policy for callbacks and logout",
      (environment) => {
        vi.stubEnv("NODE_ENV", serverEnvironment);
        expect(clientInput.safeParse({ ...input, environment }).success).toBe(
          true,
        );
        for (const field of [
          "redirectUris",
          "postLogoutRedirectUris",
        ] as const) {
          for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
            expect(
              clientInput.safeParse({
                ...input,
                environment,
                [field]: [`http://${host}:3001/callback`],
              }).success,
            ).toBe(environment === "development");
          }
        }
      },
    );

    it.each([
      "http://app.example.test/callback",
      "http://192.168.1.10/callback",
      "http://localhost.evil.test/callback",
      "http://localhost./callback",
      "http://127.1/callback",
      "http://2130706433/callback",
      "http://0x7f000001/callback",
      "http://127.0.0.2/callback",
      "http://[::ffff:127.0.0.1]/callback",
      "http://user:secret@localhost/callback",
      "http://localhost:3001/callback#fragment",
      "http://localhost:3001/callback#",
      "http://localhost:3001/*",
      "http://local\nhost:3001/callback",
      "http://localhost\\evil/callback",
      "https://*.example.test/callback",
      "https://user:secret@app.example.test/callback",
      "https://app.example.test/callback#fragment",
      "javascript:alert(1)",
    ])("rejects unsafe development URL %s", (uri) => {
      vi.stubEnv("NODE_ENV", serverEnvironment);
      for (const field of ["redirectUris", "postLogoutRedirectUris"] as const) {
        expect(
          clientInput.safeParse({ ...input, [field]: [uri] }).success,
        ).toBe(false);
      }
    });

    it("requires an explicit valid environment", () => {
      for (const environment of [undefined, "dev", "unknown"]) {
        expect(clientInput.safeParse({ ...input, environment }).success).toBe(
          false,
        );
      }
    });

    it("keeps platform and resource launch URLs restricted on production servers", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(isSafeUrl("http://localhost:3001/login")).toBe(false);
      for (const type of ["SSO", "LINK"]) {
        expect(
          platformInput.safeParse({
            name: "Test",
            slug: "test",
            description: "",
            icon: "book",
            type,
            launchUrl: "http://localhost:3001/login",
          }).success,
        ).toBe(false);
      }
    });
  },
);
