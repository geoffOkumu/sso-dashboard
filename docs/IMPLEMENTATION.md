# Implementation checklist

The existing root Next.js application remains the identity portal so the configured root `.env` continues to work. Independent demo applications live in `apps/`; reusable authorization code lives in `packages/`. Use a pnpm workspace and pinned dependencies.

- [x] Verify installed and official provider APIs.
- [x] Generate provider schema; add policy models, constraints, migration, environment validation.
- [x] Invitation-only accounts, reset, MFA, bootstrap and session controls.
- [x] Central policy, protected administration, audit and rate limiting.
- [x] Provider-managed OIDC clients and two independent PKCE clients.
- [x] Live access checks, session generation and fail-closed revocation.
- [x] Compact responsive employee and administration portal.
- [x] Policy/API/browser tests, migration verification, lint/types/build.
- [x] Setup, deployment, integration and exact validation report.

Security decisions: no refresh tokens for this release; tool sessions expire with short-lived access tokens and initiate a new OIDC authorization when needed. Every tool operation checks central policy, with at most 60 seconds of positive cache. Sensitive writes bypass cache. Account revocation deletes provider sessions and tokens and increments a persistent generation; token/session binding prevents old sessions reviving.
