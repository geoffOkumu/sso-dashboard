# Permit Kit

Self-hosted, administrator-managed identity and access management for internal tools. Permit Kit combines OpenID Connect (OIDC) single sign-on, platform-specific roles and permissions, TOTP multi-factor authentication, and central session revocation.

**Status: early development (0.1.0).** APIs and database schemas may change. Review the [security policy](SECURITY.md) and [deployment guide](docs/DEPLOYMENT.md) before using it with real accounts. The project has not undergone an independent security audit.

[Integration guide](docs/INTEGRATION.md) · [Architecture](docs/ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md) · [Report a bug](https://github.com/geoffOkumu/sso-dashboard/issues/new/choose)

The Next.js application is the identity provider and administration portal. Two independently running demo tools—a CRM and analytics app—show how to integrate SSO and live authorization. Each tool owns its database and server sessions.

## Features

- Invite employees through SMTP or create active accounts with an administrator-set password and an optional mandatory first-use password change.
- Require authenticator MFA enrollment for administrators, with recovery codes and optional email codes at sign-in. Email codes use the configured SMTP server, expire after 3 minutes, and can be requested up to twice per minute.
- Register OIDC clients and use Authorization Code Flow with PKCE S256.
- Assign roles and permissions per tool, with server-side policy enforcement.
- Revoke sessions centrally and record administrative audit events.
- Integrate tools using the included TypeScript access-check helper or the HTTP API.

Built with Next.js, React, Better Auth, Prisma, and PostgreSQL. The demo tools use Node.js and SQLite. This release supports one company per installation; it does not include tenant switching or billing.

## Quick start

Requires **Node.js 24.x**, **pnpm 11.9.0**, **PostgreSQL 17+**, and SMTP. Docker Compose is optional and supplies local PostgreSQL and [Mailpit](https://github.com/axllent/mailpit). No default application accounts or passwords are included.

From a new checkout:

```sh
git clone https://github.com/geoffOkumu/sso-dashboard.git
cd sso-dashboard
pnpm install --frozen-lockfile
cp .env.example .env
pnpm setup:env
docker compose up -d --wait postgres mailpit
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm bootstrap
pnpm dev
```

If pnpm is not installed, run `npm install --global pnpm@11.9.0` after installing Node.js 24. The repository includes `.nvmrc` for Node version managers.

Open [localhost:3000](http://localhost:3000). Sign in using the superadmin you created, then go to **Security & sessions** and finish MFA enrollment. Save the recovery codes. Administration and platform access remain blocked until MFA is verified. View local email in [Mailpit at localhost:8025](http://localhost:8025).

For an existing checkout, preserve your environment files. If you already have PostgreSQL and SMTP, skip Docker and configure their connection settings in `.env` before running migrations. Use a database dedicated to this application. The Compose credentials are local development examples only.

`setup:env` creates an ignored `.env.local` with a random authentication secret and local origin if the file is absent. It leaves existing files unchanged. `.env.local` takes precedence over `.env`; keep `DATABASE_URL` in `.env` so the Prisma CLI can read it as well. `db:seed` adds CRM/analytics platform, role, and permission definitions without creating users or client secrets, and preserves administrator edits on repeat runs.

### Configuration

See [`.env.example`](.env.example) and the [deployment guide](docs/DEPLOYMENT.md) for all settings.

| Variable                                             | Purpose                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`                                       | PostgreSQL connection for the identity provider.                     |
| `BETTER_AUTH_URL`                                    | Public origin, `http://localhost:3000` locally; HTTPS in production. |
| `BETTER_AUTH_SECRET`                                 | Stable, random secret; generated locally by `setup:env`.             |
| `PRODUCT_NAME`                                       | Portal display name; defaults to `Permit Kit`.                       |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` | Outbound email; defaults target local Mailpit.                       |
| `SMTP_USER`, `SMTP_PASSWORD`                         | Optional SMTP authentication.                                        |
| `TRUSTED_IP_HEADER`                                  | Set only behind a proxy that strips incoming copies of that header.  |
| `TEST_DATABASE_URL`                                  | Dedicated database for database and browser tests.                   |

Invitation requests persist the invitation then send email. If delivery fails, **Resend invitation** invalidates the old token and sends a replacement. Invitation links are not printed in logs.

In **Users → Add user**, choose **Set a password** to create an active account without sending an invitation. Passwords must be 12–128 characters. This trusts the administrator to establish the user's identity and treats the email as verified; share the credentials securely. Enable **One-time password** to require a new password before dashboard or SSO access. Completing that change revokes existing sessions and requires signing in with the new password. Normal email invitations remain available, and public sign-up stays disabled.

## Add people and connect tools

Public integration documentation is available at `/docs`, with links from sign-in and the dashboard. Endpoint URLs and code examples use the running server's `BETTER_AUTH_URL`, matching the OIDC issuer. The page reads this value at request time, so the same build can be deployed to different environments. Set each deployment's public origin (HTTPS in production) and restart the server after changing it. No sign-in is required and no credentials are exposed.

1. Bootstrap the first superadmin and enable MFA.
2. In **Users**, invite employees with optional initial platform grants. The emailed link verifies ownership and expires after 24 hours. Existing active users must sign in as the matching verified account before accepting.
3. In **Platforms**, configure roles and permissions and register an OIDC client for each tool/environment. Copy its secret once.
4. Copy `apps/demo-crm/.env.example` and `apps/demo-analytics/.env.example` to `.env` in those directories. Set each tool's own client ID and secret.
5. Register exact callbacks `http://localhost:3001/callback` and `http://localhost:3002/callback`; the seeded launch URLs already point to `/login`.
6. Run `pnpm dev:crm` and `pnpm dev:analytics` in separate terminals. Assign employees to the tools in **Access**.
7. Open CRM, sign in once, then open Analytics. Both use real Authorization Code Flow with PKCE S256. Opening an unassigned tool directly is denied.

Bootstrap accepts environment input (`BOOTSTRAP_EMAIL`, `BOOTSTRAP_NAME`, `BOOTSTRAP_PASSWORD`) or prompts with a hidden password. It trusts the installation operator to own the supplied email. After the first administrator exists, use the portal to grant further superadmin roles.

## Add company resources without SSO

In **Platforms → Add platform**, choose **Directory resource (no SSO)**. Enter a name, slug, description, icon and direct HTTPS URL, then select **Save resource**. Document section links (URL fragments) are supported. Enabled resources appear in **Apps & resources** for every active employee without role assignments or client credentials. Search finds both assigned apps and shared resources.

Use **Resource settings** to edit a link or turn off **Show in directory** to hide it. The destination service manages its own access; listing a resource does not sign users in or grant access there. Entry type is fixed after creation. Existing platforms retain their SSO behavior.

When upgrading an existing installation, run `pnpm db:migrate` and `pnpm db:generate` before starting the updated app.

## Security behavior

- Employees see assigned, enabled SSO apps and all enabled directory resources. Superadmins with MFA see all enabled SSO apps, including future ones. Directory links never grant SSO authorization.
- Role/permission checks execute on servers for protected reads, APIs and mutations. Cross-platform relationships are constrained in PostgreSQL.
- Confidential client credentials and tokens remain on servers. Each demo has its own random HttpOnly session cookie and SQLite store, keyed by validated issuer and subject.
- Every protected tool operation checks central policy. Positive cache is 30 seconds by default, capped at **60 seconds**. Sensitive writes always bypass it. Outages fail closed after cache expiry.
- Global logout increments a persistent generation and deletes central sessions/tokens. Old tool sessions stay invalid after another central login. Local logout ends only the relevant app session.
- Access tokens last 15 minutes. Connected apps request `offline_access` and automatically rotate refresh tokens on the server before protected requests when a token is within 60 seconds of expiry (or has expired). Renewal requires the original central SSO session and current access; it does not extend that session. See [integration and upgrade instructions](docs/INTEGRATION.md#automatic-session-renewal).
- PostgreSQL backs rate limits across app instances. The trusted proxy IP header must be configured explicitly in production.

## Validation

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Database and browser suites create a uniquely named temporary PostgreSQL schema, apply the actual migrations, and remove that schema afterward. Set `TEST_DATABASE_URL` to a dedicated test database for CI; otherwise they use the configured server with a separate schema. The database role must be allowed to create schemas. Tests never reset the configured application schema. Browser tests run isolated identity/CRM/analytics servers on ports 3100–3102. SMTP tests listen on loopback 3125. Random fixture credentials are stored only in ignored `.generated/` files during the browser run and removed in cleanup. Browser suites should run one at a time in a checkout.

Production builds require `BETTER_AUTH_SECRET`, `DATABASE_URL` and an HTTPS `BETTER_AUTH_URL`. For a local production compilation check, set `BETTER_AUTH_URL=https://identity.example.test pnpm build`; use the real HTTPS URL when deploying. Development uses the normal HTTP loopback environment.

GitHub Actions runs lint, type checking, unit tests, database tests, browser tests, and a production build using a disposable PostgreSQL service. See [CONTRIBUTING.md](CONTRIBUTING.md) for a dedicated local test database and [the dated validation report](docs/VALIDATION.md) for historical results and limitations. A past validation run does not establish the status of later commits.

## Repository guide

- `app/`, `components/`: Next.js portal, sign-in/account flows and API handlers.
- `lib/`: authentication, session guards, policy, transactional admin services, email and validation.
- `prisma/`: provider-generated schema snapshot, extended schema and SQL migration.
- `apps/demo-crm`, `apps/demo-analytics`: independent demo entry points and environment examples.
- `packages/demo-runtime`: runnable OIDC relying party with separate tool data/session storage.
- `packages/access-client`: reusable server-side access-check helper.
- `scripts/`: bootstrap, idempotent seed, environment setup, maintenance and isolated test harness.
- `tests/`: policy, cache, protocol validation, database/API/SMTP and Playwright acceptance tests.

Read [architecture and access API](docs/ARCHITECTURE.md), [integration guide](docs/INTEGRATION.md) and [deployment guide](docs/DEPLOYMENT.md) before connecting another tool or deploying. The Docker Compose setup is for local development; production deployments must supply independent HTTPS domains, SMTP and durable databases.

## Contributing and support

Bug reports, documentation improvements, and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Use [GitHub issues](https://github.com/geoffOkumu/sso-dashboard/issues) for reproducible bugs and feature proposals. For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of posting exploit details publicly.

Maintainers preparing a public release should follow the [release checklist](docs/RELEASING.md). Workspace packages are marked `private` to prevent accidental npm publication; this does not control repository visibility.

## License

Permit Kit is licensed under the [MIT License](LICENSE). Third-party dependencies retain their own licenses.
