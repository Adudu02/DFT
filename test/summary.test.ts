import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { getSummary } from "../src/lib/summary.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

// Pricing explícito SIN gpt: así el costo materializado de Codex es 0 y el test
// prueba la propiedad "share por tokens sobrevive a un agente sin tarifa" con
// independencia de lo que tenga data/pricing.json.
const CLAUDE_ONLY = { models: { "claude-opus-4-8": { input: 5, output: 25 }, "claude-haiku-4-5": { input: 1, output: 5 } } };

let tmp: string;
let db: DB;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "motor-summary-"));
  mkdirSync(join(tmp, "claude", "projX"), { recursive: true });
  copyFileSync(fx("deterministic.jsonl"), join(tmp, "claude", "projX", "s.jsonl"));
  const cdir = join(tmp, "codex", "sessions", "2026", "07", "25");
  mkdirSync(cdir, { recursive: true });
  copyFileSync(fx("codex-rollout.jsonl"), join(cdir, "rollout-2026-07-25T10-00-00-codex-sess-1.jsonl"));
  db = openDb(join(tmp, "motor.db"));
  await ingestAll(db, {
    projectsRoot: join(tmp, "claude"),
    codexRoot: join(tmp, "codex"),
    pricing: CLAUDE_ONLY,
  });
});
afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe("getSummary — perAgent", () => {
  it("desglosa por agente con share por tokens y $ solo donde hay tarifa", () => {
    const s = getSummary(db, CLAUDE_ONLY, { windowDays: 60 }); // ventana ancha: cubre 07-01..07-25
    const agents = s.perAgent.map((a) => a.agent).sort();
    expect(agents).toEqual(["claude-code", "codex"]);

    const codex = s.perAgent.find((a) => a.agent === "codex")!;
    expect(codex.tokens).toBeGreaterThan(0);
    expect(codex.costUsd).toBe(0); // gpt-5.5 sin tarifa

    const claude = s.perAgent.find((a) => a.agent === "claude-code")!;
    expect(claude.costUsd).toBeGreaterThan(0);

    // los shares suman ~1 (por tokens)
    expect(s.perAgent.reduce((n, a) => n + a.share, 0)).toBeCloseTo(1, 6);
  });
});
