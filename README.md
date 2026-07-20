# ChatV3

ChatV3 is the AOPS domain for encrypted chat rooms, messages, membership,
streaming transport, browser-safe clients, and PostgreSQL migration assets.

This repository is the clean, public source for the ChatV3 package family. It
does not depend on sibling source checkouts; published dependencies resolve
from the public npm registry.

## Packages

- `@aopslab/light-client-core`: domain-neutral browser client foundation
- `@aopslab/domain-product-client-chatv3`: browser-safe ChatV3 client SDK
- `@aopslab/domain-dm-chatv3`: domain models, services, and repositories
- `@aopslab/domain-kit-chatv3`: operation catalog and capability projection
- `@aopslab/domain-pg-bootstrap-chatv3`: packaged PostgreSQL migrations
- `@aopslab/domain-host-plugin-chatv3`: host runtime bridge

## Develop

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm run test
```

## Release

Packages are public under the `@aopslab` npm scope. Each release must pass the
build, typecheck, test, pack-content, and clean-install gates. The repository
will own release-to-npm automation through npm Trusted Publishing with GitHub
OIDC; no long-lived npm publish token belongs in this repository.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
