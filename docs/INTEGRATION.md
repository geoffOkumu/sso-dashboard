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
2. Create a tool-owned flow table (`id`, PKCE verifier, state, nonce, local return path, expiration) and server-session table (`id`, issuer, subject, access token, refresh token, security version, access-token expiration, central-session expiration). Store tokens in the server table, not a browser cookie or localStorage. Protect the database with application-only credentials and encryption at rest.
3. In `app/login/route.ts`, discover the configured issuer. Use `ClientSecretBasic`, `enableNonRepudiationChecks`, `randomState`, `randomNonce`, `randomPKCECodeVerifier` and `calculatePKCECodeChallenge`. Save a five-minute flow under a random HttpOnly host-only cookie. Use `buildAuthorizationUrl` with `response_type=code`, scopes `openid profile email offline_access`, `code_challenge_method=S256` and the exact registered callback. Only allow known local return paths.
4. In `app/callback/route.ts`, atomically consume the cookie-bound flow record. Use the configured application origin when reconstructing the callback URL; don't trust an unvalidated Host header. Call `authorizationCodeGrant` with `pkceCodeVerifier`, `expectedState`, `expectedNonce` and `idTokenExpected: true`. Keep `enableNonRepudiationChecks` enabled so signature validation is explicit. Verify the returned ID-token issuer and subject. Discovery and the maintained library enforce issuer, audience, lifetime, nonce and signature.
5. Call `/api/access/check` with your client credentials and the returned access token. Require its subject and issuer to match the validated ID token. Require finite future `expiresAt` and `sessionExpiresAt` values, with `expiresAt <= sessionExpiresAt`. Store both expirations and the authoritative `securityVersion` in your new server session; never obtain it from a browser-submitted field. Persist your local user by the **issuer + subject** pair, not email.
6. Issue a fresh random application session ID in `__Host-your-tool-session`, with `secure`, `httpOnly`, `sameSite: "lax"`, `path: "/"`, no `domain`, and lifetime capped by the central `sessionExpiresAt` returned by the access check. For loopback development use a unique non-prefixed cookie name and `secure: false`.
7. Centralize protected data access. The following is the enforcement boundary for your Next.js pages, APIs, server actions and mutations:

```ts
// lib/authorize.ts — this file must only be imported by server modules
import "server-only";
import { cookies } from "next/headers";
import { createAccessClient } from "@company/access-client";
import { getOrRenewSession } from "./tool-session";

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
  // Implement getOrRenewSession using the renewal contract below. It loads the
  // session, serializes rotation if needed, validates, and persists both tokens.
  const session = cookie ? await getOrRenewSession(cookie) : null;
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

The `getOrRenewSession` above is an adaptation point backed by your tool database, not an included central-DB shortcut. Follow the runnable SQLite examples for complete storage and callback mechanics. Do not read identity tables from your tool.

8. Implement `POST /logout` with an Origin/CSRF check, delete that app's server session and clear its cookie. For global sign-out, send the user to the central **Security & sessions** page. The central global logout invalidates existing app sessions through the live-check protocol.
9. Implement automatic renewal as described below. After the central session expires or renewal is denied, require a fresh OIDC login; never replay a failed mutation automatically.
10. Test renewal across access-token expiry (including form submissions and concurrent requests), refresh replay, central-session expiry, unassigned direct navigation, direct API privilege escalation, expired assignments, disabled clients/platforms, token/callback tampering, shared central login across tools, role changes, central outage and global logout followed by a fresh central login.

## Framework-neutral clients

Use a maintained OIDC relying-party library in the framework's server runtime. Configure the exact discovery URL `https://identity.company.com/api/auth/.well-known/openid-configuration`, client credentials, Authorization Code Flow and S256 PKCE. Validate issuer, signature, audience, expiry, nonce and state. Keep all tokens on the server. Use ID tokens only to establish identity, and the access token for the central authorization API. Port the access-client contract: cap positive caching at 60 seconds, key by issuer/client/subject/session/version/token, bypass for sensitive writes, cap at token expiry, and fail closed on outages. Implement the same session-bound refresh and atomic rotation contract below in your server runtime. Never trust role or user parameters from the browser.

## Client changes

Disable clients before retiring a deployment. Rotate credentials from the platform screen and replace the connected tool's secret immediately; the old secret no longer authenticates. Never copy client secrets into `NEXT_PUBLIC_` variables, URLs, error logs, screenshots or version control. Client-secret rotation and signing-key rotation are separate operations.

## Automatic session renewal

Access tokens still last **15 minutes**. Request `openid profile email offline_access` at login and retain the returned refresh token on the server. Despite the standard scope name, Permit Kit does **not** allow offline access after the original central session ends. Central sessions have an 8-hour lifetime, renewable through central activity after 30 minutes; app token refresh does not extend them. Each rotated refresh token has an 8-hour lifetime and is also constrained by the live central session.

Use the runnable `packages/demo-runtime/src/server.ts` and `session.ts` implementation as the reference:

1. Keep the app-session cookie and server session until the last observed central `sessionExpiresAt` (Unix milliseconds). Keep access-token expiry separately as the minimum of `expiresAt` and the token response lifetime. Never send either token to browser JavaScript.
2. Before every protected request, including POSTs, acquire a lock for that app session and reload it. If the access token has more than 60 seconds left, continue normally. Otherwise, call `oidc.refreshTokenGrant(configuration, session.refreshToken)` using the same confidential client configuration. A token that expired while the page was idle can be renewed before submitting a form, without a redirect or lost form contents.
3. Validate the refresh response with the OIDC library. If an ID token is returned, require the same issuer and subject as the original session. Require a replacement refresh token and a finite positive access-token lifetime. Call `/api/access/check` without caching and require the original issuer, subject and `securityVersion`, plus valid future expiration values. Do not replace identity or generation from the response.
4. Atomically save both rotated tokens, access-token expiry and the latest central-session expiry. Use a conditional update so a concurrent logout cannot recreate the session. Refresh the cookie lifetime from that session expiry in a route handler or server action; Next.js Server Components cannot set cookies. A shared session store needs a distributed lock across all workers. The demos use an in-process single-flight lock because they run as single instances.
5. Run the normal permission check and then the requested operation. Sensitive operations still bypass the authorization cache. Successful renewal keeps the same app session and requires no browser timer or repeated login.
6. Reject expired/revoked sessions, disabled clients/platforms, suspended users, expired assignments and generation mismatches. A new central login cannot revive an old refresh token. On denied or ambiguous refresh, remove the local session and require sign-in again. On provider outage, fail closed and return a retryable service error without executing the operation. Never automatically retry an old refresh token after an uncertain result: it may already have rotated. The provider has no reuse grace period and invalidates the token family on replay.

A successful access response contains both `expiresAt` (access-decision/token deadline) and `sessionExpiresAt` (central-session deadline). Only the former may bound a positive authorization cache. The latter is for the app-session cookie/store; it is not permission to skip access checks.

### Upgrade existing installations

Deploy the provider changes and run `pnpm db:migrate` before updating connected apps. Migration `202610230001_session_refresh` adds `offline_access` and `refresh_token` to existing registered confidential SSO clients, preserving client IDs, secrets and existing scopes. New client registrations include them automatically.

Update each connected app to request the new scope, persist rotating refresh tokens, and follow the renewal contract. Changing the provider alone cannot add renewal code to external apps. Existing app sessions have no refresh token and need one new authorization flow; a still-valid central session can satisfy it without another credential prompt. Demo SQLite stores add the new columns automatically without deleting application data. Legacy sessions remain usable until their original expiry and then need sign-in again. Apps that do not request `offline_access` retain the previous short-session behavior.
