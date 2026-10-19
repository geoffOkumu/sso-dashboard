# Contributing to Permit Kit

Contributions are welcome: bug fixes, documentation, tests, and integration examples. For significant changes, open an issue describing the problem and proposed behavior before implementing. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Development setup

Fork and clone the repository, then follow the [README quick start](README.md#quick-start). Use Node.js 24.x and the pnpm version pinned in `package.json`. Install with `pnpm install --frozen-lockfile`, and run `pnpm db:generate` before type checking or tests. Keep dependencies and `pnpm-lock.yaml` in sync when intentionally changing dependencies.

Use a feature branch. Keep changes focused, describe the problem they solve, and update relevant documentation. Avoid unrelated formatting or generated-file changes. `pnpm format` rewrites the whole checkout; to format only your changes, use `pnpm exec prettier --write <changed-files>`.

## Validation

For source changes, run:

```sh
pnpm lint
pnpm typecheck
pnpm test
```

For authentication, authorization, database, or integration changes, also run the database and browser suites. A dedicated local test database can be started with:

```sh
docker compose --profile test up -d postgres-test
```

Set `TEST_DATABASE_URL=postgresql://company:company@localhost:5433/company_access_test` in `.env.local`, wait until PostgreSQL is ready, then run:

```sh
pnpm test:db
pnpm exec playwright install chromium
pnpm test:e2e
BETTER_AUTH_URL=https://identity.example.test pnpm build
```

The harness creates and drops a random schema for each suite. The database role needs permission to create schemas. Without `TEST_DATABASE_URL`, it uses `DATABASE_URL`; always use a dedicated test database for contributions and CI. Do not run tests against production. Browser tests use ports 3100–3102 and database email tests use port 3125. Run browser suites one at a time per checkout. Stop your local `pnpm dev` first, or run browser tests in a separate checkout: Next.js permits only one development server per checkout.

GitHub Actions runs these checks with a disposable database and generated test secrets, including for fork pull requests. It does not require deployment credentials. Browser traces and screenshots can contain tokens or personal information: inspect and sanitize them before sharing; CI does not upload them automatically.

For documentation-only changes, verify commands, relative links, and formatting. State exactly what you tested in the pull request, including anything you could not run.

## Authentication and database changes

- Read [the architecture and security contract](docs/ARCHITECTURE.md) before changing policy, sessions, MFA, invitations, or OIDC integration.
- Preserve server-side authorization, fail-closed checks, cache bounds, and revocation behavior. Cover changes with regression tests that exercise the security boundary.
- Add a migration for schema changes; do not rewrite migrations that may already be deployed. Include upgrade and data-preservation notes.
- `prisma/provider.generated.prisma.txt` records the upstream provider schema. Regenerate to a temporary file and review differences when upgrading the provider; do not overwrite the extended `schema.prisma`.
- Read the relevant installed Next.js guide in `node_modules/next/dist/docs/` as required by [AGENTS.md](AGENTS.md). Framework APIs in this version may differ from older releases.
- Never include credentials, private keys, production database contents, invitation links, recovery codes, or real employee data in commits, issues, or screenshots.

## Pull requests and community

Explain the problem, resulting behavior, and validation. Include screenshots for visual changes using synthetic accounts. Link related issues and call out breaking changes. Maintainers may request changes before merging; there is no guaranteed review or support response time.

Be respectful and constructive. Critique ideas and code, avoid personal attacks and harassment, and respect other people's privacy. Maintainers may edit or remove abusive content and restrict participation when necessary.
