# Company Access

An invitation-only company identity portal with real OIDC SSO, platform-specific roles and permissions, TOTP MFA, invitations, password reset, live authorization and global session revocation.

The existing root Next.js application is the identity provider. Two independently running tools demonstrate the integration: a CRM and analytics app, each with its own database and server sessions. Your existing root `DATABASE_URL` is used unchanged.

## Quick start

Requires Node.js **24**, pnpm **11.9.0**, PostgreSQL and SMTP. No default accounts or passwords are included.

```sh
pnpm install --frozen-lockfile
pnpm setup:env
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm bootstrap
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Sign in using the superadmin you created, then go to **Security & sessions** and finish MFA enrollment. Save the recovery codes. Administration and platform access remain blocked until MFA is verified.

`setup:env` creates an ignored `.env.local` with a random authentication secret if the file is absent; it does not overwrite `.env`. If starting from scratch, copy `.env.example` to `.env` and set the database URL. Never overwrite an already configured environment. `PRODUCT_NAME` defaults to `Company Access` and can be changed in the server environment.

The database migration and idempotent CRM/analytics seed have already been applied to the database configured for this implementation. Seed creates only platform/role/permission definitions, not employees or client secrets, and does not overwrite administrator edits on repeat runs.

## Local database and email

If you already run PostgreSQL, keep that connection. Start only the local mail service:

```sh
docker compose up -d mailpit
```

For a fully containerized local setup, `docker compose up -d postgres mailpit` starts PostgreSQL on 5432 and Mailpit SMTP on 1025. Use the database URL in `.env.example` for that database. Mailpit's inbox is [localhost:8025](http://localhost:8025). The default local SMTP settings point to Mailpit. Docker is not required if you already have compatible PostgreSQL and SMTP services.

Production SMTP uses the settings in `.env.example`. Invitation requests persist the invitation then send email; a delivery failure returns a clear error, and **Resend invitation** invalidates the old token before sending a replacement. No invitation links are printed in logs.

## Add people and connect tools

1. Bootstrap the first superadmin and enable MFA.
2. In **Users**, invite employees with optional initial platform grants. The emailed link verifies ownership and expires after 24 hours. Existing active users must sign in as the matching verified account before accepting.
3. In **Platforms**, configure roles and permissions and register an OIDC client for each tool/environment. Copy its secret once.
4. Copy `apps/demo-crm/.env.example` and `apps/demo-analytics/.env.example` to `.env` in those directories. Set each tool's own client ID and secret.
5. Register exact callbacks `http://localhost:3001/callback` and `http://localhost:3002/callback`; the seeded launch URLs already point to `/login`.
6. Run `pnpm dev:crm` and `pnpm dev:analytics` in separate terminals. Assign employees to the tools in **Access**.
7. Open CRM, sign in once, then open Analytics. Both use real Authorization Code Flow with PKCE S256. Opening an unassigned tool directly is denied.

Bootstrap accepts environment input (`BOOTSTRAP_EMAIL`, `BOOTSTRAP_NAME`, `BOOTSTRAP_PASSWORD`) or prompts with a hidden password. It trusts the installation operator to own the supplied email. After the first administrator exists, use the portal to grant further superadmin roles.

## Security behavior

- Employees see only assigned, enabled apps. Superadmins with MFA see all enabled platforms, including future ones.
- Role/permission checks execute on servers for protected reads, APIs and mutations. Cross-platform relationships are constrained in PostgreSQL.
- Confidential client credentials and tokens remain on servers. Each demo has its own random HttpOnly session cookie and SQLite store, keyed by validated issuer and subject.
- Every protected tool operation checks central policy. Positive cache is 30 seconds by default, capped at **60 seconds**. Sensitive writes always bypass it. Outages fail closed after cache expiry.
- Global logout increments a persistent generation and deletes central sessions/tokens. Old tool sessions stay invalid after another central login. Local logout ends only the relevant app session.
- Access tokens last 15 minutes. Refresh grants are disabled; expiration triggers a new OIDC flow, reusing a valid central session.
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

See [validation report](docs/VALIDATION.md) for the exact executed results and remaining limitations.

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
