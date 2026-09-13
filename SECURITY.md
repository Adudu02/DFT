# Security Policy

Motor Agéntico reads agent transcripts (Claude Code, Codex, Qwen) that may
contain sensitive information. Security isn't an add-on: it's the reason the
tool is viable to run against real data. This document states what the design
guarantees, how the dependency tree is structured, and how to report an issue.

## Design guarantees

- **Read-only sources.** `~/.claude`, `~/.codex`, `~/.qwen` and every other
  source are always opened with the `'r'` flag (see
  `packages/core/src/lib/fs-readonly.ts`). The
  [`packages/core/test/integrity.test.ts`](packages/core/test/integrity.test.ts)
  test hashes the source tree before and after ingesting and fails if anything
  changed.
- **Never touches credentials.** Read whitelist: only `rollout-*.jsonl`,
  `*.jsonl` and memory `*.md`. It never opens `~/.codex/auth.json`, `.env` or
  credential files.
- **No API keys.** Cost is *API-equivalent*, computed from local token counts;
  the tool never asks for, receives or stores credentials from any provider.
- **The DB stores metrics only.** `./data/motor.db` stores token counts, model
  and skill names — **never** your prompt text. The Activity drill-down reads
  prompts from the original transcript (read-only) at query time and persists
  them nowhere.
- **Local only.** The server binds **exclusively to `127.0.0.1:8081`** — no
  auth, no network exposure. All own state lives in `./data/`.
- **Versioned storage.** The DB records its schema version
  (`schema_info`); opening a database written by a newer program version fails
  fast with an actionable message instead of misreading it.

## Dependencies

Minimal attack surface by design: **three external production dependencies in
total**, split by layer. The app (`motor-agentico`) uses `fastify` +
`@fastify/static` and depends on the engine; the engine (`motor-agentico-core`,
a workspace package) uses only `better-sqlite3`. Everything else is build/test
tooling (`vite`, `vitest`, `tailwind`…) that is **not part of the runtime**
(`pnpm serve` serves the already-built `dist` through Fastify).

`pnpm audit` status:

- **0 vulnerabilities, runtime and dev.** The frontend toolchain migration to
  `vite` 8 + `@vitejs/plugin-react` 6 + `vitest` 4 (August 2026) closed the
  previously documented dev-server advisories. CI enforces it with
  `pnpm audit --audit-level=moderate` on every push and pull request.

Verifiable on any clean checkout:

```bash
pnpm install --frozen-lockfile && pnpm audit
```

## Reporting a vulnerability

Open an issue in the repository describing the problem and how to reproduce it.
If the details are sensitive, say so in the issue and we'll coordinate a private
channel before publishing details.
