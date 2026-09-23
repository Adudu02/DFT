# Release

One tag push runs the full pipeline (audit → typecheck → lint → tests → build), packs
self-contained tarballs, attaches them to the GitHub Release, and — only when the
`NPM_TOKEN` secret is configured — publishes the four packages to npm.

## Distribution (registry-free)

npmjs publishing is currently unavailable, so releases ship as **self-contained
tarballs** attached to each GitHub Release. They bundle the workspace packages
(`how-much-did-u-waste-core`, `-insights`) inside `node_modules/` as
`bundledDependencies` — npm never queries the registry for them; only public
dependencies (fastify, better-sqlite3, …) are fetched. Install/run:

```bash
npx https://github.com/Adudu02/How-much-did-U-waste/releases/download/<tag>/how-much-did-u-waste-<version>.tgz
```

Rebuild the tarballs locally with `pnpm build && node scripts/pack-release.mjs`
(output in `release/`, gitignored). CI/terminal reporter:
`how-much-did-u-waste-report-<version>.tgz` (bin: `how-much-did-u-waste-report`).

## Packages

| npm package | Role |
|---|---|
| `how-much-did-u-waste-core` | Engine: adapters, ingest, metrics-only SQLite, costing |
| `how-much-did-u-waste-insights` | Domain layer: waste, skills, memory, config |
| `how-much-did-u-waste-report` | CI/terminal waste reporter (exit-code by threshold) |
| `how-much-did-u-waste` | The dashboard + CLI (`npx how-much-did-u-waste`) |

`workspace:*` dependencies are resolved to concrete versions by `pnpm publish`
at publish time; all four versions are bumped together.

## Enabling npm publishing (when npmjs is back)

1. npm account (https://www.npmjs.com/signup).
2. Create an **Automation** access token: npm → Access Tokens → Generate New
   Token → **Automation** (bypasses 2FA for CI publishing).
3. Add it as the `NPM_TOKEN` secret in
   https://github.com/Adudu02/How-much-did-U-waste/settings/secrets/actions.

Every tag from then on publishes automatically (prerelease tags under the npm
dist-tag `beta`); no workflow change needed.

## Cutting a release

```bash
# 1. Bump "version" in all four package.json (root + packages/{core,insights,reporter})
#    and the README heading
# 2. Commit, then tag with the same version and push:
git tag v0.0.2-beta
git push origin v0.0.2-beta
# 3. Watch .github/workflows/release.yml; tarballs land on the GitHub Release
#    automatically. Update the README "Try it" URL to the new tag/version.
```

If a publish fails mid-way, re-run the failed job; npm refuses to re-publish an
existing version, and `gh release upload --clobber` refreshes tarballs safely.
