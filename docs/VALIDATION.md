# Validation report

This is a historical development snapshot, not a current CI result or a guarantee of security. Rerun the documented checks against the commit you intend to deploy.

Completed 17 October 2026 against the pinned pnpm workspace, Node.js 24.18.0, Next.js 16.4.2, Better Auth/OAuth Provider 1.7.10, Prisma 6.19.2 and the configured PostgreSQL server.

## Executed successfully

| Check                                                      | Result                                                                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                           | All five workspace projects installed from `pnpm-lock.yaml`; required dependency build scripts explicitly allowed.                                            |
| Prisma client generation                                   | Generated from the extended official provider schema.                                                                                                         |
| `pnpm exec prisma migrate status`                          | Application schema up to date; initial migration applied.                                                                                                     |
| `pnpm db:check`                                            | Database reachable, 25 tables in the application schema.                                                                                                      |
| Development seed                                           | CRM and Analytics platform/role/permission definitions applied; no accounts or OIDC credentials created. Final application counts: zero users, two platforms. |
| `pnpm lint`                                                | Passed without warnings.                                                                                                                                      |
| `pnpm typecheck`                                           | Next route generation and TypeScript passed.                                                                                                                  |
| `pnpm test`                                                | 36 unit tests passed.                                                                                                                                         |
| `pnpm test:db`                                             | 15 database/API/SMTP tests passed.                                                                                                                            |
| `pnpm test:e2e`                                            | 10 Chromium browser tests passed against independent identity, CRM and Analytics servers.                                                                     |
| `BETTER_AUTH_URL=https://identity.example.test pnpm build` | Production Webpack build passed, including TypeScript and page generation.                                                                                    |
| `pnpm audit --prod --json`                                 | Zero production advisories.                                                                                                                                   |
| `git diff --check`                                         | Passed.                                                                                                                                                       |

Database suites create a randomly named disposable PostgreSQL schema, apply the actual SQL migration and remove it afterward. Browser fixtures use random credentials and provider-generated clients; temporary credentials and demo databases are removed afterward. The application schema is not reset. Desktop/mobile sign-in, administration and launcher screenshots were inspected. Docker Compose was supplied but not launched; database checks used the already configured PostgreSQL server, and SMTP tests used an actual local SMTP listener.

## What the tests establish

- Default-deny policy, superadmin override ordering, inactive users, disabled platforms/clients, assignment expiry and permission checks.
- Cache bounds, context separation, sensitive-operation bypass, token expiry and fail-closed behavior after cache expiry using deterministic clocks.
- Provider-backed invitation acceptance, expiry, replay rejection, existing-account matching and atomic concurrent consumption; actual SMTP invitation/resend delivery and single-use password reset with session revocation.
- Database-enforced cross-platform role/permission constraints, employee denial at administrative APIs, MFA guards and concurrent last-superadmin preservation.
- Maintained OIDC library rejection of invalid state, nonce, issuer, audience, expiry and signature. Protocol-validation unit tests use controlled token responses; browser SSO uses the real running provider and clients.
- Employees' assigned-only launcher, unassigned direct-tool denial, and viewer mutation denial through direct requests.
- Real PKCE login and SSO into the second tool without another credential prompt; actual MFA enrollment and TOTP login continuation into a tool.
- Role/permission changes and assignment revocation on existing sessions; global logout invalidating both tools and remaining invalid after a fresh central login.
- Newly registered platforms available to superadmins without assignments; client registration, editing, rotation and disabling, with secrets absent from listing responses.

The final runs have no failing tests. An intermediate database run exposed mail fixtures leaving an extra administrator behind; fixture cleanup now isolates the concurrent last-admin test. Earlier integration fixes included preserving OIDC continuation through MFA and avoiding duplicate callback navigation.

## Setup still required from the operator

1. Run `pnpm bootstrap` to supply your administrator email, name and hidden password. No default credentials are provided.
2. Run `pnpm dev`, sign in and finish TOTP MFA enrollment; save recovery codes.
3. Start Mailpit or configure working SMTP before inviting real employees.
4. Register each demo's client, place its one-time secret in that app's ignored environment file, and start the demos. Browser-test clients are deliberately not retained in the application database.
5. For deployment, supply real HTTPS origins, SMTP credentials, durable databases, reverse-proxy configuration and backups. See `DEPLOYMENT.md`.

## Known limits

The development-only ESLint dependency chain contains one high-severity `braces` advisory (GHSA-vfj7-8cjw-p6xm). The advisory names 3.0.4 as the fix, but the configured registry's version listing ends at 3.0.3. Production dependencies audited clean on the date of this report. Upgrade the lint chain when the fix is available; avoid untrusted pathological glob inputs in lint configuration.

Demo tools intentionally use separate local SQLite databases and run as single instances; their storage is an integration example, not a multi-instance production database. Positive authorization caching is 30 seconds by default and capped at 60; sensitive operations bypass it. No refresh tokens are issued. Tool sessions expire with 15-minute access tokens and then reauthorize. Production HTTPS deployment and real email deliverability require operator infrastructure and were not exercised locally. This validation is not an independent security audit.

## Publication preparation — 19 October 2026

Checked the open-source preparation changes with Node.js 24.18.0 and pnpm 11.9.0:

- Frozen lockfile validation passed without dependency changes.
- ESLint, Next.js route type generation, TypeScript, and all 39 unit tests passed.
- All 15 database/API/SMTP tests passed using a disposable schema, which was removed afterward.
- All 10 Chromium browser tests passed in a temporary source copy because the main checkout already had a development server running. The temporary schema, credentials, and source copy were removed afterward.
- The production Webpack build passed with an HTTPS example origin.
- Markdown relative links, YAML parsing, formatting, and `git diff --check` passed.
- A limited scan of all three locally available commits (145 unique file blobs) found no tracked environment files, database dumps, private-key headers, or common provider-token patterns. This is not a comprehensive secret scan; run a dedicated history scanner before publishing other refs or release assets.
- A fresh production dependency audit reported zero advisories. The full audit still reported the development-only `braces` advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory requires 3.0.4 or later; the configured registry reported 3.0.3 as its latest version. No dependency override was added for an unavailable release.

The GitHub Actions workflow has been added and its YAML checked locally; it has not yet run on GitHub. Docker Compose setup and a fresh dependency download were not exercised in this pass. GitHub visibility, security settings, and branch protection were not changed. The maintainer selected MIT; the full license and matching metadata are included. Confirming asset distribution rights remains on the [release checklist](RELEASING.md).
