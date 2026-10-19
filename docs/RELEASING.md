# Public release checklist

Use this checklist before making the repository public and before publishing subsequent releases. Checking in these files does not change GitHub settings or publish a release.

## Before the first public release

- [x] Select the MIT license, add the full [LICENSE](../LICENSE) text, and set `MIT` in all workspace manifests and the README.
- [ ] Confirm you have permission to distribute the code, supplied logo, and derived images under the MIT license. Dependencies retain their own licenses.
- [ ] Review every commit and branch that will be published for credentials, database exports, personal data, and internal URLs. Run a dedicated secret scanner over Git history as well as the current tree. Rotate exposed credentials before cleaning history; `.gitignore` alone is insufficient.
- [ ] Verify the fresh-clone instructions with an empty development database. Never use production credentials or data for release tests.
- [ ] Confirm the repository name and URLs in `package.json`, README, security policy, and issue templates.
- [ ] Enable [private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository) and verify the reporting link in `SECURITY.md` works for an external contributor.
- [ ] Enable available GitHub secret scanning, push protection, and dependency alerts. Review Actions permissions; fork PRs must not receive deployment secrets or run on trusted self-hosted infrastructure.
- [ ] Run CI on GitHub, then configure a branch ruleset requiring pull requests and the `Checks` job before merging to the default branch. GitHub settings are separate from workflow files.
- [ ] Add a repository description and relevant topics. Publish release notes describing the early-development status, supported runtime, setup, and known limitations.

## For each release

1. Review dependency updates and run `pnpm audit` and `pnpm audit --prod`. Resolve or explicitly assess advisories; do not carry forward an old clean audit claim.
2. Run `pnpm install --frozen-lockfile`, `pnpm db:generate`, lint, type checking, unit tests, database tests, browser tests, and a production build. Use disposable databases and an HTTPS origin for the build. See [CONTRIBUTING.md](../CONTRIBUTING.md).
3. Review database migrations and upgrade instructions. Test backup restoration and the upgrade path before deploying changes to a real installation.
4. Update the version and release notes together. State breaking changes, migrations, security fixes, and any checks that were not performed.
5. Tag the reviewed commit and publish the release after CI passes. Repository releases do not require npm publication: the workspace manifests intentionally remain `private`.

Keep test fixtures, browser traces, local environment files, database contents, and generated build output out of release assets. Do not publish operational secrets with a source archive.
