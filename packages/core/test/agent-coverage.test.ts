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
import Database from "better-sqlite3";
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

describe("ingestAll — cobertura de 10 agentes (5 archivo + 5 sync)", () => {
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
    // opencode (SQLite — schema real verificado 2026-09-14)
    writeFileSync(join(tmp, "opencode.db"), ""); // lo crea el fixture de abajo
    const oc = new Database(join(tmp, "opencode.db"));
    oc.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, tokens_input INT, tokens_output INT,
      tokens_reasoning INT, tokens_cache_read INT, tokens_cache_write INT, agent TEXT, model TEXT,
      time_created INT, time_updated INT)`);
    oc.prepare(`INSERT INTO session (id, directory, tokens_input, tokens_output, tokens_reasoning,
      tokens_cache_read, tokens_cache_write, agent, model, time_created, time_updated)
      VALUES ('ses_oc1', '/home/u/Projects/OcProj', 700, 150, 25, 300, 20, 'build',
      '{"id":"glm-5.3","providerID":"zai"}', 1000, 2000)`).run();
    oc.close();
    // grok (SQLite — schema del plan, fixture-driven)
    const gr = new Database(join(tmp, "grok.db"));
    gr.exec(`CREATE TABLE usage_events (session_id TEXT, model TEXT, input_tokens INT,
      output_tokens INT, total_tokens INT, cost_micros INT, created_at INT)`);
    gr.prepare("INSERT INTO usage_events (session_id, model, input_tokens, output_tokens, total_tokens, cost_micros, created_at) VALUES ('g-1', 'grok-5', 100, 20, 120, 1500, ?)").run(Date.now() - 30_000);
    gr.close();
    // goose (SQLite acumulativo)
    const gs = new Database(join(tmp, "goose.db"));
    gs.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, accumulated_input_tokens INT, accumulated_output_tokens INT, model TEXT, updated_at INT)`);
    gs.prepare("INSERT INTO sessions (id, accumulated_input_tokens, accumulated_output_tokens, model, updated_at) VALUES ('gs-1', 500, 100, 'goose-4', ?)").run(Date.now() - 60_000);
    gs.close();
    // amp (threads JSON)
    mkdirSync(join(tmp, "amp-threads"), { recursive: true });
    writeFileSync(join(tmp, "amp-threads", "T-abc.json"), JSON.stringify({
      usage: { inputTokens: 3000, outputTokens: 400, cacheReadInputTokens: 2500, cacheCreationInputTokens: 60 },
      model: "amp-model",
      updatedAt: Date.now() - 30_000,
    }));
    // crush (SQLite cost-only)
    const cr = new Database(join(tmp, "crush.db"));
    cr.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, cost REAL, model TEXT, created_at INT)`);
    cr.prepare("INSERT INTO sessions (id, cost, model, created_at) VALUES ('cr-1', 1.25, 'crush-model', ?)").run(Date.now() - 90_000);
    cr.close();

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
      opencodeRoot: join(tmp, "opencode.db"),
      grokRoot: join(tmp, "grok.db"),
      gooseRoot: join(tmp, "goose.db"),
      ampRoot: join(tmp, "amp-threads"),
      crushRoot: join(tmp, "crush.db"),
      pricing: await loadPricing(),
    });

    const agents = (db.prepare("SELECT DISTINCT agent FROM sessions ORDER BY agent").all() as { agent: string }[]).map(
      (r) => r.agent,
    );
    expect(agents).toEqual(["amp", "claude-code", "codex", "crush", "gemini", "goose", "grok", "opencode", "qwen", "zcode"]);

    const byAgent = (agent: string): number =>
      (db.prepare("SELECT COUNT(*) AS n FROM usage_events ue JOIN sessions s ON s.id = ue.session_id WHERE s.agent = ?").get(agent) as { n: number }).n;
    expect(byAgent("claude-code")).toBeGreaterThan(0);
    expect(byAgent("codex")).toBeGreaterThan(0);
    expect(byAgent("qwen")).toBeGreaterThan(0);
    expect(byAgent("zcode")).toBe(1);
    expect(byAgent("gemini")).toBe(1);
    expect(byAgent("opencode")).toBe(1);
    expect(byAgent("grok")).toBe(1);
    expect(byAgent("goose")).toBe(1);
    expect(byAgent("amp")).toBe(1);
    expect(byAgent("crush")).toBe(1);
    expect(summary.files).toBeGreaterThanOrEqual(10);

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
      opencodeRoot: join(tmp, "opencode.db"),
      grokRoot: join(tmp, "grok.db"),
      gooseRoot: join(tmp, "goose.db"),
      ampRoot: join(tmp, "amp-threads"),
      crushRoot: join(tmp, "crush.db"),
      pricing: await loadPricing(),
    };
    await ingestAll(db, opts);
    const second = await ingestAll(db, opts);
    expect(second.eventsInserted).toBe(0);
  });
});
