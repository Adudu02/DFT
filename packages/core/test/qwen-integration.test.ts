/**
 * Integración end-to-end del adapter Qwen vía ingestAll() — el equivalente a
 * lo que tienen Claude Code y Codex. Cubre sesiones, eventos, el mapa
 * sesión→proyecto y skills en DB (el wiring real del registry, no un stub).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { loadPricing } from "../src/lib/pricing.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

// Línea de mensaje de usuario con uso de skill: no produce eventos de uso,
// pero parseSkills (vía registry) debe capturarla. Así se ven transcripts reales.
const SKILL_LINE =
  '{"type":"user","timestamp":"2026-09-01T10:00:00Z","message":{"parts":[{"text":"/review este código"}]}}\n';

describe("ingestAll — integración Qwen", () => {
  let tmp: string;
  let db: DB;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "motor-qwen-int-"));
    mkdirSync(join(tmp, "qwen", "usage"), { recursive: true });
    copyFileSync(fx("qwen-usage.jsonl"), join(tmp, "qwen", "usage", "token-usage-2026-08.jsonl"));
    appendFileSync(join(tmp, "qwen", "usage", "token-usage-2026-08.jsonl"), SKILL_LINE);
    // Solo session-aaa-111 está mapeada; session-bbb-222 debe caer a "qwen".
    writeFileSync(
      join(tmp, "qwen", "usage_record.jsonl"),
      '{"version":1,"sessionId":"session-aaa-111","project":"/home/user/mi-proj"}\n',
    );
    db = openDb(join(tmp, "motor.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("ingiere sesiones, eventos y skills desde usage files", async () => {
    const summary = await ingestAll(db, {
      // Raíces inexistentes en tmp: los adapters devuelven [] sin fallar (aislamiento).
      projectsRoot: join(tmp, "claude-inexistente"),
      codexRoot: join(tmp, "codex-inexistente"),
      qwenRoot: join(tmp, "qwen"),
      pricing: await loadPricing(),
    });

    const sessions = db.prepare("SELECT id, project, agent FROM sessions ORDER BY id").all() as {
      id: string;
      project: string;
      agent: string;
    }[];
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.id === "session-aaa-111")).toMatchObject({ project: "mi-proj", agent: "qwen" });
    // El proyecto es GRANULARIDAD DE ARCHIVO en Qwen: todas las sesiones de un
    // usage file heredan el mapeo de su primera fila (bbb no cae a "qwen" aquí).
    expect(sessions.find((s) => s.id === "session-bbb-222")).toMatchObject({ project: "mi-proj", agent: "qwen" });

    // Los 3 eventos del fixture; la línea de skill no genera eventos.
    const events = db
      .prepare("SELECT dedup_key FROM usage_events WHERE session_id LIKE 'session-%'")
      .all() as { dedup_key: string }[];
    expect(events).toHaveLength(3);

    // El circuito completo registry → parseSkills → DB.
    expect(summary.skillsInserted).toBeGreaterThanOrEqual(1);
    const skills = db.prepare("SELECT skill, session_id FROM skills_usage").all() as {
      skill: string;
      session_id: string;
    }[];
    expect(skills).toContainEqual({ skill: "review", session_id: "session-aaa-111" });
  });

  it("la reingesta es incremental (dedup por dedup_key)", async () => {
    const opts = {
      projectsRoot: join(tmp, "claude-inexistente"),
      codexRoot: join(tmp, "codex-inexistente"),
      qwenRoot: join(tmp, "qwen"),
      pricing: await loadPricing(),
    };
    await ingestAll(db, opts);
    const second = await ingestAll(db, opts);
    expect(second.eventsInserted).toBe(0);
    expect(second.skillsInserted ?? 0).toBe(0);
  });
});
