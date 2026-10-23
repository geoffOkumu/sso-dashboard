# Implementation checklist

The root Next.js application is the identity portal. Independent demo applications live in `apps/`; reusable authorization code lives in `packages/`. Use a pnpm workspace and pinned dependencies.

- [x] Verify installed and official provider APIs.
- [x] Generate provider schema; add policy models, constraints, migration, environment validation.
- [x] Invitation-only accounts, reset, MFA, bootstrap and session controls.
- [x] Central policy, protected administration, audit and rate limiting.
- [x] Provider-managed OIDC clients and two independent PKCE clients.
- [x] Live access checks, session generation and fail-closed revocation.
- [x] Compact responsive employee and administration portal.
- [x] Policy/API/browser tests, migration verification, lint/types/build.
- [x] Setup, deployment, integration and exact validation report.

Security decisions: access tokens last 15 minutes; connected apps automatically renew them with rotating server-held refresh tokens while the original central session and current platform policy remain valid. Renewal does not extend the central session, runs before protected reads and writes, and is serialized per app session. Revoked, expired or mismatched sessions fail closed; a new login is required after renewal fails. Every tool operation checks central policy, with at most 60 seconds of positive cache. Sensitive writes bypass cache. Account revocation deletes provider sessions and tokens and increments a persistent generation; token/session binding prevents old sessions reviving.
