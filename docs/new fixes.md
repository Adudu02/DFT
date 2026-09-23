# New fixes

## Performance baseline

- Scope: local dashboard only; no shared or production load tests.
- Database: 12,441 usage events, 206 sessions, 3.5 MB.
- Local API timings:
  - `/api/summary`: 20–21 ms
  - `/api/waste`: 19–22 ms
  - `/api/activity`: 15–17 ms
- Full tests: 6.2 s.
- Full build: 6.0 s; peak RSS about 425 MB.
- Initial dashboard payload: about 192 KB gzip, including Recharts.

## Fix 1 — stabilize automatic refresh

File: `web/src/components/RefreshControl.tsx`

`run` is recreated on every render, but the interval effect depends on it. The
`ago` counter renders every second, so the 30-second interval is continuously
destroyed and recreated. Automatic refresh may never fire.

Minimal fix: stabilize `run` with `useCallback`, or keep the callback in a ref
and make the interval effect depend only on `auto`.

Acceptance criteria:

- Automatic refresh fires every `REFRESH_MS` while enabled.
- Updating the elapsed-seconds label does not reset the refresh interval.
- Manual refresh behavior remains unchanged.

## Fix 2 — index usage events by session

File: `packages/core/src/lib/db.ts`

`usage_events.session_id` has no index. SQLite currently builds an automatic
covering index for the activity join, while waste analysis scans the full event
table.

Minimal fix: add a compatibility-safe migration for:

```sql
CREATE INDEX IF NOT EXISTS idx_usage_session_ts
ON usage_events(session_id, ts);
```

Acceptance criteria:

- `/api/activity`, session detail, and waste queries use the new index.
- `EXPLAIN QUERY PLAN` no longer reports an automatic covering index for the
  activity join.
- Existing databases migrate without data loss.

## Fix 3 — avoid repeated full-table aggregations

Files: `packages/core/src/lib/summary.ts`,
`packages/insights/src/waste.ts`

`/api/summary` executes several independent aggregations and an unbounded
`SELECT DISTINCT day`. `/api/waste` groups the complete event table twice on
every request. Current timings are acceptable, but cost grows linearly with
the event table.

Minimal fix: measure again after Fix 2. If these endpoints exceed the agreed
latency budget, cache results by database/config/pricing version and invalidate
after ingestion or relevant configuration changes. Avoid materialized tables
until profiling shows the cache is insufficient.

Acceptance criteria:

- Add a reproducible benchmark using a representative larger fixture.
- Define a target latency before introducing caching.
- Preserve response schemas and pricing/config correctness.

## Fix 4 — reduce initial chart payload if needed

File: `web/src/pages/Inicio.tsx`

Recharts contributes about 99 KB gzip to the initial dashboard load. Route
code-splitting already prevents other pages from loading up front.

Defer this fix until browser first-load measurements show it matters. Then
replace the small charts with native SVG/CSS or a smaller chart dependency.

## Verification

After implementing any fix:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm run build
```

Re-run the local API timing sample and `EXPLAIN QUERY PLAN` checks. Do not run
load tests against shared or production environments.
