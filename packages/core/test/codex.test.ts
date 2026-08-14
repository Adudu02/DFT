import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCodexMeta, parseCodexLines, parseCodexSkills, discoverCodexSessions } from "../src/adapters/codex.js";
import { openDb, type DB } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { loadPricing } from "../src/lib/pricing.js";
import { getSkills } from "../src/lib/skills.js";
import { DEFAULT_CONFIG } from "../src/lib/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);
const raw = readFileSync(fx("codex-rollout.jsonl"), "utf8");

describe("parseCodexMeta / parseCodexLines", () => {
  it("lee session_id y cwd del session_meta", () => {
    expect(parseCodexMeta(raw)).toEqual({ sessionId: "codex-sess-1", cwd: "/home/adudu/myproj" });
  });

  it("un UsageEvent por token_count; input = input_tokens − cached; salta corruptas y ceros", () => {
    const { events, skipped } = parseCodexLines(raw, "codex-sess-1");
    expect(skipped).toBe(1); // la línea corrupta
    expect(events).toHaveLength(2); // el token_count en cero se descarta
    const [e1, e2] = events.map((e) => e.event);
    expect(e1).toMatchObject({ model: "gpt-5.5", input: 800, cacheRead: 200, output: 100, cacheWrite: 0 });
    expect(e2).toMatchObject({ model: "gpt-5.5", input: 2000, cacheRead: 0, output: 50 });
    expect(e1.day).toBe("2026-07-25");
  });

  it("incremental: fromLine salta eventos ya leídos pero mantiene el modelo del turn_context", () => {
    const { events } = parseCodexLines(raw, "codex-sess-1", 4); // desde la 2ª medición
    expect(events).toHaveLength(1);
    expect(events[0].event).toMatchObject({ model: "gpt-5.5", input: 2000 });
  });

  it("detecta comandos directos de usuario, no menciones en prosa", () => {
    expect(parseCodexSkills(raw)).toEqual([
      { skill: "ponytail", ts: "2026-07-25T10:00:05.000Z", kind: "command" },
    ]);
  });
});

describe("ingestAll con Codex (codexRoot explícito)", () => {
  let tmp: string;
  let db: DB;
  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "motor-codex-"));
    // layout: <codexRoot>/sessions/2026/07/25/rollout-*.jsonl
    const dir = join(tmp, "codex", "sessions", "2026", "07", "25");
    mkdirSync(dir, { recursive: true });
    copyFileSync(fx("codex-rollout.jsonl"), join(dir, "rollout-2026-07-25T10-00-00-codex-sess-1.jsonl"));
    // claudeRoot vacío (dir existente sin transcripts) para aislar de ~/.claude real
    mkdirSync(join(tmp, "claude"), { recursive: true });
    db = openDb(join(tmp, "motor.db"));
    await ingestAll(db, {
      projectsRoot: join(tmp, "claude"),
      codexRoot: join(tmp, "codex"),
      pricing: await loadPricing(),
    });
  });
  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("descubre e ingiere la sesión Codex con agent=codex y project del cwd", () => {
    const s = db.prepare("SELECT id, agent, project, turns FROM sessions").get() as {
      id: string;
      agent: string;
      project: string;
      turns: number;
    };
    expect(s.id).toBe("codex-sess-1");
    expect(s.agent).toBe("codex");
    expect(s.project).toBe("myproj");
    expect(s.turns).toBe(2);
  });

  it("discoverCodexSessions encuentra el rollout bajo sessions/**", async () => {
    const found = await discoverCodexSessions(join(tmp, "codex"));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("rollout-");
  });

  it("asocia el uso de skill con Codex y calcula su ahorro", () => {
    const skill = getSkills(
      db,
      { ...DEFAULT_CONFIG, hourlyRate: 120, minutesPerUseDefault: 5 },
      new Map(),
    ).skills.find((s) => s.name === "ponytail");
    expect(skill).toMatchObject({ uses: 1, savedUsd: 10, agents: [{ agent: "codex", uses: 1, savedUsd: 10 }] });
  });

  it("rebuild reanaliza los skills de archivos ya ingeridos", async () => {
    db.exec("DELETE FROM skills_usage");
    const summary = await ingestAll(db, {
      projectsRoot: join(tmp, "claude"),
      codexRoot: join(tmp, "codex"),
      pricing: await loadPricing(),
      reparseSkills: true,
    });
    expect(summary.skillsInserted).toBe(1);
  });
});
