# Release

One tag push runs the full pipeline (audit → typecheck → lint → tests → build) and
publishes the four packages to npm in dependency order, then creates the GitHub
Release with auto-generated notes.

## Packages

| npm package | Role |
|---|---|
| `how-much-did-u-waste-core` | Engine: adapters, ingest, metrics-only SQLite, costing |
| `how-much-did-u-waste-insights` | Domain layer: waste, skills, memory, config |
| `how-much-did-u-waste-report` | CI/terminal waste reporter (exit-code by threshold) |
| `how-much-did-u-waste` | The dashboard + CLI (`npx how-much-did-u-waste`) |

`workspace:*` dependencies are resolved to concrete versions by `pnpm publish`
at publish time; all four versions are bumped together.

## One-time setup

1. npm account (https://www.npmjs.com/signup).
2. Create an **Automation** access token: npm → Access Tokens → Generate New
   Token → **Automation** (bypasses 2FA for CI publishing).
3. Add it as the `NPM_TOKEN` secret in
   https://github.com/Adudu02/DFT/settings/secrets/actions.

## Cutting a release

```bash
# 1. Bump "version" in all four package.json (root + packages/{core,insights,reporter})
# 2. Commit, then tag with the same version and push:
git tag v1.0.0
git push origin v1.0.0
# 3. Watch .github/workflows/release.yml; verify at https://www.npmjs.com/package/how-much-did-u-waste
```

If a publish fails mid-way, re-run only the missing packages manually with
`pnpm --filter <pkg> publish --access public --no-git-checks` (npm refuses to
re-publish an existing version, so already-published packages are skipped).
