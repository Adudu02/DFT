/**
 * Integración de cobertura multi-agente (workstream A1): las 5 fuentes
 * soportadas (Claude Code, Codex, Qwen, ZCode, Gemini) en un fixture-tree y
 * una sola `ingestAll` con raíces explícitas → eventos de todos los agentes.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { loadPricing } from "../src/lib/pricing.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

const ZCODE_LINE = JSON.stringify({
  completedAt: "2026-09-13T04:31:33.309Z",
  requestId: "zc-req-1",
  sessionId: "sess_zc1",
  type: "model_io",
  model: { modelId: "GLM-5.3-Flash" },
  response: { usage: { inputTokens: 5000, outputTokens: 300, totalTokens: 5300, cacheReadTokens: 4000, cacheWriteTokens: 100 } },
});

const GEMINI_LINE = JSON.stringify({
  type: "gemini",
  timestamp: "2026-09-13T10:00:05Z",
  model: "gemini-3-pro",
  tokens: { input: 1000, output: 200, cached: 600, thoughts: 50, total: 650 },
});

describe("ingestAll — cobertura de 5 agentes", () => {
  let tmp: string;
  let db: DB;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "motor-5ag-"));
    // claude-code
    mkdirSync(join(tmp, "claude", "projects", "projX"), { recursive: true });
    copyFileSync(fx("deterministic.jsonl"), join(tmp, "claude", "projects", "projX", "sesion1.jsonl"));
    // codex
    mkdirSync(join(tmp, "codex", "sessions", "2026", "09", "13"), { recursive: true });
    copyFileSync(fx("codex-rollout.jsonl"), join(tmp, "codex", "sessions", "2026", "09", "13", "rollout-f.jsonl"));
    // qwen
    mkdirSync(join(tmp, "qwen", "usage"), { recursive: true });
    copyFileSync(fx("qwen-usage.jsonl"), join(tmp, "qwen", "usage", "token-usage-2026-08.jsonl"));
    // zcode
    mkdirSync(join(tmp, "zcode"), { recursive: true });
    writeFileSync(join(tmp, "zcode", "model-io-sess_zc1.jsonl"), ZCODE_LINE + "\n");
    // gemini
    mkdirSync(join(tmp, "gemini", "hash1", "chats"), { recursive: true });
    writeFileSync(join(tmp, "gemini", "hash1", "chats", "session-g1.jsonl"), GEMINI_LINE + "\n");

    db = openDb(join(tmp, "motor.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("una ingesta registra eventos de los cinco agentes", async () => {
    const summary = await ingestAll(db, {
      projectsRoot: join(tmp, "claude", "projects"),
      codexRoot: join(tmp, "codex"),
      qwenRoot: join(tmp, "qwen"),
      zcodeRoot: join(tmp, "zcode"),
      geminiRoot: join(tmp, "gemini"),
      pricing: await loadPricing(),
    });

    const agents = (db.prepare("SELECT DISTINCT agent FROM sessions ORDER BY agent").all() as { agent: string }[]).map(
      (r) => r.agent,
    );
    expect(agents).toEqual(["claude-code", "codex", "gemini", "qwen", "zcode"]);

    const byAgent = (agent: string): number =>
      (db.prepare("SELECT COUNT(*) AS n FROM usage_events ue JOIN sessions s ON s.id = ue.session_id WHERE s.agent = ?").get(agent) as { n: number }).n;
    expect(byAgent("claude-code")).toBeGreaterThan(0);
    expect(byAgent("codex")).toBeGreaterThan(0);
    expect(byAgent("qwen")).toBeGreaterThan(0);
    expect(byAgent("zcode")).toBe(1);
    expect(byAgent("gemini")).toBe(1);
    expect(summary.files).toBeGreaterThanOrEqual(5);

    // ZCode: convención Anthropic (cache read aparte, NO restado del input)
    const zc = db.prepare(
      "SELECT ue.input_tokens AS input, ue.cache_read_tokens AS cacheRead FROM usage_events ue JOIN sessions s ON s.id = ue.session_id WHERE s.agent = 'zcode'",
    ).get() as { input: number; cacheRead: number };
    expect(zc).toEqual({ input: 5000, cacheRead: 4000 });

    // Gemini: cached restado del input y thoughts plegados a output
    const gm = db.prepare(
      "SELECT ue.input_tokens AS input, ue.output_tokens AS output, ue.cache_read_tokens AS cacheRead FROM usage_events ue JOIN sessions s ON s.id = ue.session_id WHERE s.agent = 'gemini'",
    ).get() as { input: number; output: number; cacheRead: number };
    expect(gm).toEqual({ input: 400, output: 250, cacheRead: 600 });
  });

  it("la reingesta es incremental en los cinco agentes", async () => {
    const opts = {
      projectsRoot: join(tmp, "claude", "projects"),
      codexRoot: join(tmp, "codex"),
      qwenRoot: join(tmp, "qwen"),
      zcodeRoot: join(tmp, "zcode"),
      geminiRoot: join(tmp, "gemini"),
      pricing: await loadPricing(),
    };
    await ingestAll(db, opts);
    const second = await ingestAll(db, opts);
    expect(second.eventsInserted).toBe(0);
  });
});
