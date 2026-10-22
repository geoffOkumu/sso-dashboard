# Connect another application

For public documentation with endpoint URLs and examples tailored to the running environment, open `/docs` on your identity deployment. These URLs use its configured `BETTER_AUTH_URL` at request time.

## Register it

1. Bootstrap/sign in to Permit Kit and finish MFA enrollment.
2. In **Platforms**, add a name, slug, icon and launch URL. Use the tool's `/login` route as the launch URL. Saving this URL alone does not integrate SSO.
3. Add permission keys such as `contacts.read`, `contacts.write` and `contacts.delete`. Create roles and select their permissions.
4. Register a client for each environment. Enter exact callback URLs and optional post-logout URLs. Staging and Production clients require HTTPS URLs. Development clients may also use HTTP on the exact loopback hosts `localhost`, `127.0.0.1` or `[::1]`, even when the SSO server runs in production. This applies to callbacks and post-logout URLs; wildcard URLs are never allowed. Copy the provider-generated secret immediately; only its hash is stored centrally. Client IDs are not secrets. Secrets belong exclusively in the tool's server environment.
5. Assign employee roles in **Access**, optionally with an expiration. A superadmin has implicit full access after MFA.

## Run the complete examples

Copy each demo's `.env.example` to `.env`, then enter its own credentials. Development registrations use callbacks `http://localhost:3001/callback` and `http://localhost:3002/callback` respectively. Use the same hostname consistently; do not mix `localhost` and `127.0.0.1` in an authorization flow.

```sh
pnpm dev              # identity, localhost:3000
pnpm dev:crm          # independent CRM, localhost:3001
pnpm dev:analytics    # independent analytics, localhost:3002
```

Open CRM directly; it starts the provider login flow. Once signed in, open Analytics. If the user has access, the same central session authenticates the second tool without another credential prompt. Each app has a separate cookie and SQLite database under its `.data/` directory. Tokens are server-side. The launcher and direct tool URLs use exactly the same real OIDC flow.

## Local development with live SSO

On the live deployment, register a separate client with **Environment: Development** and the exact callback `http://localhost:3001/callback` (optionally `http://localhost:3001/` for post-logout). Assign your user access to the platform. Keep the platform's shared launch URL pointed at its deployed application; start the local application directly for development.

For the CRM demo, set `apps/demo-crm/.env`:

```dotenv
APP_URL=http://localhost:3001
PORT=3001
OIDC_ISSUER=https://your-live-sso.example/api/auth
OIDC_CLIENT_ID=your-development-client-id
OIDC_CLIENT_SECRET=your-development-client-secret
```

Run `pnpm dev:crm` and open `http://localhost:3001`. The browser signs in on the live SSO deployment and redirects back to localhost; the local server exchanges the authorization code and checks permissions against the live deployment. No tunnel or local identity server is needed. Keep the local app in development mode and its client secret on the server.

Callbacks match exactly, including hostname, port and path. Other HTTP hosts, LAN addresses, wildcard hosts, credentials and fragments are rejected. Changing a client to Staging or Production requires replacing all HTTP callback and post-logout URLs with HTTPS URLs in the same edit. Platform launch URLs and directory links retain their existing HTTPS restrictions on production SSO deployments.

## Next.js integration

Use `openid-client` 6.8.8 on the server. The complete callback and validation implementation is in `packages/demo-runtime/src/server.ts`; adapt its flow/session persistence to your tool's database. Use Node runtime, not Edge for this implementation.

1. Install `openid-client` and the workspace `@company/access-client` package.
2. Create a tool-owned flow table (`id`, PKCE verifier, state, nonce, local return path, expiration) and server-session table (`id`, issuer, subject, access token, security version, expiration). Store tokens in the server table, not a browser cookie or localStorage. Protect the database with application-only credentials and encryption at rest.
3. In `app/login/route.ts`, discover the configured issuer. Use `ClientSecretBasic`, `enableNonRepudiationChecks`, `randomState`, `randomNonce`, `randomPKCECodeVerifier` and `calculatePKCECodeChallenge`. Save a five-minute flow under a random HttpOnly host-only cookie. Use `buildAuthorizationUrl` with `response_type=code`, scopes `openid profile email`, `code_challenge_method=S256` and the exact registered callback. Only allow known local return paths.
4. In `app/callback/route.ts`, atomically consume the cookie-bound flow record. Use the configured application origin when reconstructing the callback URL; don't trust an unvalidated Host header. Call `authorizationCodeGrant` with `pkceCodeVerifier`, `expectedState`, `expectedNonce` and `idTokenExpected: true`. Keep `enableNonRepudiationChecks` enabled so signature validation is explicit. Verify the returned ID-token issuer and subject. Discovery and the maintained library enforce issuer, audience, lifetime, nonce and signature.
5. Call `/api/access/check` with your client credentials and the returned access token. Require its subject and issuer to match the validated ID token. Store the authoritative `securityVersion` in your new server session; never obtain it from a browser-submitted field. Persist your local user by the **issuer + subject** pair, not email.
6. Issue a fresh random application session ID in `__Host-your-tool-session`, with `secure`, `httpOnly`, `sameSite: "lax"`, `path: "/"`, no `domain`, and lifetime capped by the access token. For loopback development use a unique non-prefixed cookie name and `secure: false`.
7. Centralize protected data access. The following is the enforcement boundary for your Next.js pages, APIs, server actions and mutations:

```ts
// lib/authorize.ts — this file must only be imported by server modules
import "server-only";
import { cookies } from "next/headers";
import { createAccessClient } from "@company/access-client";
import { toolDatabase } from "./tool-database";

const access = createAccessClient({
  issuer: process.env.OIDC_ISSUER!,
  clientId: process.env.OIDC_CLIENT_ID!,
  clientSecret: process.env.OIDC_CLIENT_SECRET!,
  endpoint: process.env.ACCESS_CHECK_URL!,
  cacheMs: 30_000,
});

export async function requirePermission(permission: string, sensitive = false) {
  const cookie = (await cookies()).get("__Host-your-tool-session")?.value;
  // Implement using YOUR tool's server-session table, not the central database.
  const session = cookie ? await toolDatabase.sessions.findById(cookie) : null;
  if (!session || session.expiresAt <= Date.now())
    throw new Error("Unauthenticated");
  return access.check(
    {
      sessionId: session.id,
      accessToken: session.accessToken,
      subject: session.subject,
      securityVersion: session.securityVersion,
    },
    permission,
    sensitive,
  );
}

// Before a sensitive mutation, including a server action:
await requirePermission("contacts.delete", true);
// Now perform the deletion in your tool's own database.
```

The `toolDatabase` above is an adaptation point, not an included central-DB shortcut. Follow the runnable SQLite examples for complete storage and callback mechanics. Do not read identity tables from your tool.

8. Implement `POST /logout` with an Origin/CSRF check, delete that app's server session and clear its cookie. For global sign-out, send the user to the central **Security & sessions** page. The central global logout invalidates existing app sessions through the live-check protocol.
9. After the 15-minute token/session lifetime expires, start a fresh OIDC flow. Do not enable refresh/offline scopes without designing and testing refresh-time policy and rotation. The current provider deliberately does not offer refresh grants.
10. Test unassigned direct navigation, direct API privilege escalation, expired assignments, disabled clients/platforms, token/callback tampering, shared central login across tools, role changes, central outage and global logout followed by a fresh central login.

## Framework-neutral clients

Use a maintained OIDC relying-party library in the framework's server runtime. Configure the exact discovery URL `https://identity.company.com/api/auth/.well-known/openid-configuration`, client credentials, Authorization Code Flow and S256 PKCE. Validate issuer, signature, audience, expiry, nonce and state. Keep all tokens on the server. Use ID tokens only to establish identity, and the access token for the central authorization API. Port the access-client contract: cap positive caching at 60 seconds, key by issuer/client/subject/session/version/token, bypass for sensitive writes, cap at token expiry, and fail closed on outages. Never trust role or user parameters from the browser.

## Client changes

Disable clients before retiring a deployment. Rotate credentials from the platform screen and replace the connected tool's secret immediately; the old secret no longer authenticates. Never copy client secrets into `NEXT_PUBLIC_` variables, URLs, error logs, screenshots or version control. Client-secret rotation and signing-key rotation are separate operations.
