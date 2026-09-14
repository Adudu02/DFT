/**
 * Quota probes Fase 1 (add-quota-probes): parsers por proveedor, caché con
 * TTL, registry aislado y sanitización de credenciales. Todo sin red.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheFreshness, mergeCache, readQuotaCache, writeQuotaCache } from "../src/quota/cache.js";
import { parseClaudeUsage } from "../src/quota/probers/claude.js";
import { mapCodexWindow, parseCodexUsage, codexOfflineSnapshots } from "../src/quota/probers/codex.js";
import { mapZaiWindow, parseZaiUsage } from "../src/quota/probers/zai.js";
import { runQuotaProbers, type QuotaProbers } from "../src/quota/probers.js";
import type { QuotaSnapshot } from "../src/quota/types.js";

const NOW = new Date("2026-09-13T12:00:00Z");

describe("parseClaudeUsage — tolerante a buckets planos y limits[]", () => {
  it("forma plana: five_hour/seven_day/opus/sonnet", () => {
    const snaps = parseClaudeUsage(
      {
        five_hour: { utilization: 23, resets_at: "2026-09-13T15:00:00Z" },
        seven_day: { utilization: 60, resets_at: "2026-09-18T00:00:00Z" },
        seven_day_opus: { utilization: 81, resets_at: "2026-09-18T00:00:00Z" },
        seven_day_sonnet: { utilization: 40, resets_at: "2026-09-18T00:00:00Z" },
      },
      NOW,
    );
    expect(snaps).toHaveLength(4);
    expect(snaps[0]).toMatchObject({ provider: "claude", window: "five_hour", usedPercent: 23 });
    expect(snaps[2]).toMatchObject({ window: "weekly", model: "claude-opus", usedPercent: 81 });
    expect(snaps[3]).toMatchObject({ window: "weekly", model: "claude-sonnet", usedPercent: 40 });
  });
  it("forma limits[]: session/weekly_all/weekly_scoped con scope.model", () => {
    const snaps = parseClaudeUsage(
      {
        limits: [
          { kind: "session", utilization: 10, resets_at: "2026-09-13T15:00:00Z" },
          { kind: "weekly_all", utilization: 55 },
          { kind: "weekly_scoped", utilization: 77, scope: { model: "claude-opus" } },
        ],
      },
      NOW,
    );
    expect(snaps).toHaveLength(3);
    expect(snaps[2]).toMatchObject({ window: "weekly", model: "claude-opus", usedPercent: 77 });
  });
  it("sin formas reconocidas => vacío (nunca inventa)", () => {
    expect(parseClaudeUsage({ otra_cosa: 1 }, NOW)).toEqual([]);
  });
});

describe("parseCodexUsage + mapa de ventanas", () => {
  it("mapea primary/secondary (plan_type incluido)", () => {
    const snaps = parseCodexUsage(
      {
        plan_type: "plus",
        rate_limit: {
          primary_window: { used_percent: 40, limit_window_minutes: 300, reset_at: "2026-09-13T15:00:00Z" },
          secondary_window: { used_percent: 10, limit_window_minutes: 10080 },
        },
      },
      NOW,
    );
    expect(snaps).toHaveLength(2);
    expect(snaps[0]).toMatchObject({ window: "five_hour", usedPercent: 40, plan: "plus" });
    expect(snaps[1]).toMatchObject({ window: "weekly", usedPercent: 10 });
  });
  it("reset_after_seconds se convierte a ISO", () => {
    const snaps = parseCodexUsage({ rate_limit: { primary_window: { used_percent: 1, limit_window_seconds: 300, reset_after_seconds: 3600 } } }, NOW);
    expect(snaps[0].resetsAt).toBe("2026-09-13T13:00:00.000Z");
  });
  it("mapCodexWindow: 300 → five_hour, 10080 → weekly", () => {
    expect(mapCodexWindow(300)).toBe("five_hour");
    expect(mapCodexWindow(10080)).toBe("weekly");
    expect(mapCodexWindow(4320)).toBe("window-4320");
  });
});

describe("parseZaiUsage — forma A (limits) y forma B (total_usage)", () => {
  it("forma A: mapea unit 3/6 a five_hour/weekly", () => {
    const snaps = parseZaiUsage(
      { data: { limits: [
        { type: "CREDIT_LIMIT", percentage: 12, unit: 3, number: 5, nextResetTime: 1787619857000 },
        { type: "CREDIT_LIMIT", percentage: 80, unit: 6, number: 1, nextResetTime: 1790000000000 },
      ] } },
      NOW,
    );
    expect(snaps).toHaveLength(2);
    expect(snaps[0]).toMatchObject({ window: "five_hour", usedPercent: 12 });
    expect(snaps[1]).toMatchObject({ window: "weekly", usedPercent: 80 });
  });
  it("forma B: total_usage con porcentaje calculado", () => {
    const snaps = parseZaiUsage({ data: { total_usage: { used: 30, limit: 100, remaining: 70 } } }, NOW);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ window: "monthly", usedPercent: 30, limit: 100, remaining: 70 });
  });
  it("mapZaiWindow: unidades 4/5", () => {
    expect(mapZaiWindow(4, 3)).toBe("3d");
    expect(mapZaiWindow(5, 1)).toBe("monthly");
  });
});

describe("caché — round-trip, TTL y merge por proveedor", () => {
  let tmp: string;
  let path: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "motor-quota-"));
    path = join(tmp, "quota-cache.json");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const snap: QuotaSnapshot = { provider: "claude", window: "five_hour", usedPercent: 10, fetchedAt: NOW.toISOString(), origin: "live" };

  it("write → read → freshness según TTL", () => {
    writeQuotaCache(NOW.toISOString(), [snap], path);
    const cache = readQuotaCache(path)!;
    expect(cache.snapshots).toHaveLength(1);
    expect(cacheFreshness(cache, 5, Date.parse("2026-09-13T12:03:00Z")).fresh).toBe(true);
    expect(cacheFreshness(cache, 5, Date.parse("2026-09-13T12:10:00Z")).fresh).toBe(false);
  });
  it("merge reemplaza por proveedor y preserva el resto", () => {
    const cache = { version: 1 as const, fetchedAt: NOW.toISOString(), snapshots: [
      snap,
      { provider: "codex", window: "five_hour", usedPercent: 20, fetchedAt: NOW.toISOString(), origin: "offline-stale" as const },
    ] };
    const merged = mergeCache(cache, "2026-09-13T13:00:00Z", [{ provider: "claude", snapshots: [{ ...snap, usedPercent: 50 }] }]);
    expect(merged.snapshots).toHaveLength(2);
    expect(merged.snapshots.find((s) => s.provider === "claude")?.usedPercent).toBe(50);
    expect(merged.snapshots.find((s) => s.provider === "codex")?.usedPercent).toBe(20);
  });
  it("caché corrupta/ausente => null", () => {
    expect(readQuotaCache(join(tmp, "no-existe.json"))).toBeNull();
  });
});

describe("runQuotaProbers — paralelo, aislado, estados", () => {
  const ctx = { claudeCredentialsPath: "/no/existe", codexRoot: "/no/existe" };
  const probers: QuotaProbers = {
    ok: async () => [{ provider: "ok", window: "five_hour", usedPercent: 1, fetchedAt: NOW.toISOString(), origin: "live" }],
    boom: async () => {
      throw new Error("HTTP 500 en endpoint");
    },
  };

  it("fallo individual no afecta al resto; habilitado por default", async () => {
    const results = await runQuotaProbers(probers, {}, ctx, { fetchImpl: (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch, now: () => NOW });
    const ok = results.find((r) => r.provider === "ok")!;
    const boom = results.find((r) => r.provider === "boom")!;
    expect(ok.status).toBe("live");
    expect(ok.snapshots).toHaveLength(1);
    expect(boom.status).toBe("error");
    expect(boom.error).toMatch(/HTTP 500/);
  });
  it("disabled no ejecuta el prober", async () => {
    let called = 0;
    const lazy: QuotaProbers = { lazy: async () => { called++; return []; } };
    const results = await runQuotaProbers(lazy, { lazy: false }, ctx, { fetchImpl: (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch, now: () => NOW });
    expect(results[0]).toMatchObject({ provider: "lazy", status: "disabled" });
    expect(called).toBe(0);
  });
  it("no-credential por convención de mensaje", async () => {
    const nc: QuotaProbers = { zai: async () => { throw new Error("no-credential: falta la key"); } };
    const results = await runQuotaProbers(nc, {}, ctx, { fetchImpl: (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch, now: () => NOW });
    expect(results[0].status).toBe("no-credential");
  });
});

describe("sanitización — credenciales fuera de resultados", () => {
  it("ni el token ni los headers aparecen en los snapshots", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "motor-san-"));
    const SECRET = "sk-ant-SECRET-TOKEN-123";
    writeFileSync(join(tmp, "creds.json"), JSON.stringify({ claudeAiOauth: { accessToken: SECRET } }));
    const { probeClaude } = await import("../src/quota/probers/claude.js");
    const snaps = await probeClaude({
      fetchImpl: (async () => ({ ok: true, json: async () => ({ five_hour: { utilization: 5 } }) })) as unknown as typeof fetch,
      now: () => NOW,
      timeoutMs: 1000,
      claudeCredentialsPath: join(tmp, "creds.json"),
    });
    const serialized = JSON.stringify(snaps);
    expect(serialized).not.toContain(SECRET);
    rmSync(tmp, { recursive: true, force: true });
  });
});
