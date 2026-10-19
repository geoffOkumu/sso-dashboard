import { getEnv } from "./env";

// Call during request rendering so a promoted build uses its runtime origin.
// Explicitly allowlist public values; never return the environment object.
export function getPublicDocs() {
  const env = getEnv();
  const origin = env.BETTER_AUTH_URL;
  const issuer = `${origin}/api/auth`;
  return {
    name: env.PRODUCT_NAME,
    origin,
    issuer,
    discovery: `${issuer}/.well-known/openid-configuration`,
    authorize: `${issuer}/oauth2/authorize`,
    token: `${issuer}/oauth2/token`,
    userinfo: `${issuer}/oauth2/userinfo`,
    jwks: `${issuer}/jwks`,
    introspect: `${issuer}/oauth2/introspect`,
    accessCheck: `${origin}/api/access/check`,
    security: `${origin}/security`,
  };
}
