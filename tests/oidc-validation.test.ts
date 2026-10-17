import { describe, it, expect } from "vitest";
import * as oidc from "openid-client";
import { SignJWT, generateKeyPair, exportJWK } from "jose";
async function flow(
  change:
    | "valid"
    | "state"
    | "nonce"
    | "audience"
    | "issuer"
    | "expiry"
    | "signature",
) {
  const issuer = "https://identity.example.test/api/auth";
  const key = await generateKeyPair("RS256"),
    wrong = await generateKeyPair("RS256");
  const jwt = await new SignJWT({
    nonce: change === "nonce" ? "wrong" : "expected-nonce",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(change === "issuer" ? "https://evil.test" : issuer)
    .setSubject("subject")
    .setAudience(change === "audience" ? "another-client" : "client")
    .setIssuedAt()
    .setExpirationTime(
      change === "expiry" ? Math.floor(Date.now() / 1000) - 120 : "5m",
    )
    .sign(change === "signature" ? wrong.privateKey : key.privateKey);
  const config = new oidc.Configuration(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth2/authorize`,
      token_endpoint: `${issuer}/oauth2/token`,
      jwks_uri: `${issuer}/jwks`,
      id_token_signing_alg_values_supported: ["RS256"],
    },
    "client",
    { token_endpoint_auth_method: "client_secret_basic" },
    oidc.ClientSecretBasic("secret"),
  );
  config[oidc.customFetch] = async (input) => {
    const url = String(input);
    if (url.endsWith("/jwks"))
      return Response.json({
        keys: [
          {
            ...(await exportJWK(key.publicKey)),
            kid: "test",
            alg: "RS256",
            use: "sig",
          },
        ],
      });
    return Response.json({
      access_token: "opaque-token",
      token_type: "Bearer",
      expires_in: 300,
      id_token: jwt,
    });
  };
  oidc.enableNonRepudiationChecks(config);
  return oidc.authorizationCodeGrant(
    config,
    new URL(
      `https://tool.test/callback?code=valid-code&state=${change === "state" ? "tampered" : "expected-state"}&iss=${encodeURIComponent(issuer)}`,
    ),
    {
      pkceCodeVerifier: "verifier".repeat(8),
      expectedState: "expected-state",
      expectedNonce: "expected-nonce",
      idTokenExpected: true,
    },
  );
}
describe("OIDC client callback validation", () => {
  it("accepts a valid signed issuer/audience/nonce-bound ID token", async () => {
    expect((await flow("valid")).claims()?.sub).toBe("subject");
  });
  it.each([
    "state",
    "nonce",
    "audience",
    "issuer",
    "expiry",
    "signature",
  ] as const)("rejects invalid %s", async (change) => {
    await expect(flow(change)).rejects.toThrow();
  });
});
