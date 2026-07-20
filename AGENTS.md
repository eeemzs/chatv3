# ChatV3 Repository Rules

This repository is the canonical public source for the ChatV3 domain.

- Keep the repository independently installable. Do not add dependencies on
  sibling source checkouts or machine-local paths.
- External `@aopslab/*` dependencies must resolve from the public npm
  registry. Internal ChatV3 workspace dependencies must become ordinary exact
  semver dependencies in packed artifacts.
- Run build, typecheck, tests, package-content checks, and a clean packed-install
  smoke before the first or any subsequent publication.
- This repository owns its release-to-npm automation. Use npm Trusted
  Publishing with GitHub OIDC; do not store a long-lived npm publish token.
- Never commit tokens, local database files, generated build output, or
  machine-specific configuration.
- Creating a GitHub Release is the explicit maintainer action that may trigger
  an automated npm publication after all release gates pass.
