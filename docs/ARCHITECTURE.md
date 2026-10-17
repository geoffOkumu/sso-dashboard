# Architecture and security contract

## Applications and boundaries

The existing root Next.js App Router project is the identity portal. `apps/demo-crm` and `apps/demo-analytics` are independently running Node 24 applications. Each has its own SQLite database, navigation, records, server session store, and host-only cookie. They never read the identity database. `packages/access-client` is the reusable server-side policy client; `packages/demo-runtime` provides the small common demo server.

The one-company model has `SUPERADMIN` and `EMPLOYEE`. A platform role is unrelated to the global role. Employees cannot list other employees or call admin endpoints. The UI is not the authorization boundary: every central handler and demo server operation checks policy.

## Authentication and schema provenance

Better Auth 1.7.10 provides credentials, password hashing, persistent sessions, reset tokens, TOTP, recovery codes and signing keys. `@better-auth/oauth-provider` 1.7.10 provides OIDC. `prisma/provider.generated.prisma.txt` is the unmodified output from the official `auth@1.7.10 generate` command using `scripts/auth-schema.ts`. `schema.prisma` extends that schema with policy tables and relations. Do not overwrite it when upgrading: regenerate into a temporary file and review differences.

An invitation stores a SHA-256 hash of a cryptographically random 256-bit token. Resend replaces the hash and invalidates the prior link. Acceptance verifies possession of the emailed token, atomically consumes it, activates the intended email identity and creates the intended assignments. The provider's password hasher creates the credential in the same transaction. Existing active accounts must be signed in as the matching verified identity; acceptance does not reset their password or downgrade an existing superadmin. Invited users cannot authenticate. Suspended users cannot create sessions or use existing sessions. Invited users become active only through invitation acceptance. Active and suspended accounts transition through an administrator's action. Reactivation never restores deleted sessions.

The bootstrap CLI is a trusted operator operation, marks its supplied email verified, and refuses to overwrite accounts or add further administrators after the first exists. This is the explicit email-ownership exception for first installation. Further users must accept email invitations. Bootstrap is idempotent for its existing active superadmin. It never prints passwords.

Superadmins must finish verified TOTP enrollment before privileged operations or platform access. Enrollment revokes prior password-only sessions. The provider rotates the enrolling session after verification. Superadmins cannot disable MFA; recovery codes are single-use. There is no administrator MFA bypass endpoint. Keep recovery codes safely stored.

## Authorization order

1. Require authenticated subject and live central session.
2. Deny non-active users.
3. Deny disabled platforms and client registrations.
4. Reject mismatched session generation.
5. Active superadmins with MFA have every permission on every enabled platform.
6. Employees require a non-revoked, unexpired platform assignment.
7. Required permissions must belong to the assigned platform role.
8. Deny everything else.

Both authorization requests with existing sessions and token issuance enforce policy. The token-claim extension rechecks at issuance even when login/consent resumes internally. No refresh grant or offline scope is offered; tokens expire after 15 minutes. Reauthorization uses the existing central session and current policy. OIDC access tokens are never a permanent source of authorization.

Composite foreign keys enforce role/platform and permission/platform integrity. Administrative data changes and audit entries share a transaction except provider-managed client creation/rotation, which have their own provider transaction. A failed client-to-platform link disables the orphan provider client. Rotation must be retried if its audit write fails; an already-rotated secret cannot be recovered. Administrative mutations use a PostgreSQL advisory transaction lock, including checks that prevent concurrent demotion/suspension of the last active superadmin. Direct database writes are an operator trust boundary and must not be used for routine administration.

## Access endpoint

`POST /api/access/check`, `Content-Type: application/json`:

```json
{ "token": "<the user's access token>" }
```

Authenticate with HTTP Basic using the registered confidential client's ID and secret (form-encode each before Base64 encoding). The provider introspects the token and verifies credentials and client ownership. The handler derives the subject, session and platform from validated provider context; it does not accept a requested user or platform ID. It requires a still-existing central session belonging to the token's subject.

Successful response:

```json
{
  "allowed": true,
  "reason": "granted",
  "subject": "<oidc-sub>",
  "issuer": "https://identity.company.com/api/auth",
  "platformId": "<uuid>",
  "role": "viewer",
  "permissions": ["contacts.read"],
  "superadmin": false,
  "securityVersion": 1,
  "expiresAt": 1790000000000
}
```

Responses are `no-store, private`. Authentication failure is 401; policy denial is 403; throttling is 429; unavailable backing services are 503. Clients fail closed for any unsuccessful/malformed result. Do not cache these responses in a CDN.

## Session and revocation behavior

Central sessions live for 8 hours; demo sessions live no longer than their 15-minute access token. Demo session cookies contain only random references; access tokens remain in each tool's server database. Cookies have HttpOnly, SameSite=Lax, no Domain, and Secure + \_\_Host names in production. Demo cookie names are distinct for local development, where cookie scopes ignore ports. OIDC flow state, nonce and verifier remain in the tool database with a five-minute, single-consumption browser-bound flow cookie.

The access helper keys successful entries by issuer, registered client, subject, app session ID, security version and token hash. It caches for 30 seconds by default; configured values are capped at 60 seconds and token expiry. Cache lifetime starts before the request, not after it. Sensitive writes bypass cached decisions. Unavailable authorization denies access once a valid cache entry expires; it never extends cache on failure. Cached reads may remain valid for the documented window.

Suspension, platform/client disablement, assignment changes/expiry, permission edits and demotion are observed at the next check, within at most 60 seconds. Sign out here removes only the current app's session. Central sign-out also removes the particular central session, so tools tied to it subsequently fail checks. Global logout and admin session revocation increment `User.securityVersion`, delete central sessions and stored OAuth tokens, and remove pending user-bound verification challenges. An old tool session never becomes valid again after another central sign-in. A suspended account's reactivation cannot restore old sessions. Provider JWT signature validity alone does not override the live session check.

## Operational controls

Authentication endpoints use the provider's database-backed rate limiter plus an atomic PostgreSQL UPSERT limiter for sign-in, reset, MFA and token exchange. Custom invitation, admin and access endpoints use the same atomic limiter. `TRUSTED_IP_HEADER` is accepted only when explicitly configured: the edge proxy must strip user-supplied copies. Without it, requests share a conservative bucket. Configure it correctly for production traffic.

Sensitive self-service and administrative mutations require the exact configured Origin; Better Auth additionally provides its own CSRF/trusted-origin validation. The registered redirect policy requires exact strings, no wildcard, credentials or fragments. Safe return paths are local and allowlisted in the demo. No access/identity tokens are placed in launcher URLs. Logs record administrative identifiers and selected non-secret details, not passwords, client secrets, invitation tokens or recovery codes. Audit retention/backup and database encryption are deployment responsibilities.

Local HTTP registrations use the provider's `native` application-type URL rules, with confidential Basic authentication and PKCE still required. This is necessary because 1.7.10 rejects loopback URLs for `web` registrations. An extra redirect validator disables the native variable-port exception and requires exact registered URIs. Production clients use HTTPS `web` registrations. This is a supported development configuration, not a simulated SSO flow.

Signing keys are persisted by the JWT plugin in `jwks`. Preserve the database and `BETTER_AUTH_SECRET`; losing either can invalidate sessions or encrypted MFA/key material. See deployment guidance for supported rotation. Refresh rotation is intentionally out of scope because refresh grants are disabled. Demo SQLite deployments are single-instance examples; use a tool-owned shared database/session store for horizontal scaling.
