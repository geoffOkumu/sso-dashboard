# Security policy

Permit Kit handles identities, credentials, and authorization. It is in early development and has not undergone an independent security audit. Tests and dependency audits do not replace an operational security review.

## Reporting a vulnerability

Do not disclose exploit details, credentials, tokens, or personal information in a public issue or pull request.

Use GitHub's private **Report a vulnerability** form on the repository's [Security advisories page](https://github.com/geoffOkumu/sso-dashboard/security/advisories). If that option is unavailable, open a public issue containing only a request for a private security contact, with no vulnerability details. Maintainers must enable private vulnerability reporting before the public launch; see the [release checklist](docs/RELEASING.md).

Include the affected commit or version, a minimal reproduction using synthetic data, expected and actual behavior, likely impact, and any proposed fix. Only test installations you own or are authorized to assess. Remove real credentials from attachments and logs.

Maintainers will assess reports and coordinate fixes and disclosure with reporters. There is no guaranteed response time, security support SLA, or bug bounty program.

## Supported versions

During the 0.x development phase, fixes target the latest code on the default branch. Older commits and releases do not have a separate maintenance or backport commitment. Review migrations and release notes before updating an installation.

## Deployment boundaries

- Use HTTPS, stable secrets, exact OIDC redirect URIs, trusted proxy configuration, and durable databases as described in [DEPLOYMENT.md](docs/DEPLOYMENT.md).
- The Docker Compose passwords and example environment values are for local development. Generate unique credentials for deployed environments.
- Demo CRM and analytics apps illustrate integration. Their SQLite stores and single-process design require review before production use.
- Successful authorization can be cached for up to 60 seconds. Sensitive writes bypass caching; review these semantics for your use case.
- Run `pnpm audit` and `pnpm audit --prod` before releases. Historical audit results in documentation are not current vulnerability assessments.
- If a credential reaches Git history, rotate or revoke it. Deleting the file or adding it to `.gitignore` does not revoke the credential or remove prior commits.
