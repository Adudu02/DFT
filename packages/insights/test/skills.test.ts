import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillUsages } from "how-much-did-u-waste-core";
import { openDb, type DB } from "how-much-did-u-waste-core";
import { ingestAll } from "how-much-did-u-waste-core";
import { discoverCatalog, getSkills, type CatalogEntry } from "../src/skills.js";
import { loadConfig, saveConfig, DEFAULT_CONFIG, type Config } from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

describe("parseSkillUsages", () => {
  const usages = parseSkillUsages(readFileSync(fx("skills.jsonl"), "utf8"));

  it("detecta command-name en eventos user (con y sin command-args)", () => {
    const caveman = usages.filter((u) => u.skill === "caveman");
    expect(caveman).toHaveLength(2);
    expect(caveman[0].kind).toBe("command");
  });

  it("detecta comando nativo /model", () => {
    expect(usages.some((u) => u.skill === "model" && u.kind === "command")).toBe(true);
  });

  it("detecta Skill tool_use en assistant", () => {
    const fd = usages.find((u) => u.skill === "frontend-design");
    expect(fd?.kind).toBe("skill-tool");
  });
});

describe("ingest + getSkills", () => {
  let tmp: string;
  const catalog = new Map<string, CatalogEntry>([
    ["caveman", { name: "caveman", description: "modo caveman", category: "skill" }],
    ["other-skill", { name: "other-skill", description: "", category: "skill" }],
  ]);

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "motor-sk-"));
    const dir = join(tmp, "proj");
    mkdirSync(dir, { recursive: true });
    copyFileSync(fx("skills.jsonl"), join(dir, "sk.jsonl"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  async function seed(): Promise<DB> {
    const db = openDb(join(tmp, "motor.db"));
    // pricing default del repo
    const { loadPricing } = await import("how-much-did-u-waste-core");
    await ingestAll(db, { projectsRoot: tmp, pricing: await loadPricing() });
    return db;
  }

  it("skills_usage no se duplica en re-ingesta", async () => {
    const db = await seed();
    const before = (db.prepare("SELECT COUNT(*) AS n FROM skills_usage").get() as { n: number }).n;
    const { loadPricing } = await import("how-much-did-u-waste-core");
    await ingestAll(db, { projectsRoot: tmp, pricing: await loadPricing() });
    const after = (db.prepare("SELECT COUNT(*) AS n FROM skills_usage").get() as { n: number }).n;
    expect(after).toBe(before);
    expect(before).toBe(4); // caveman x2, model, frontend-design
    db.close();
  });

  it("agrega usos y calcula savedUsd = usos·min·tarifa/60", async () => {
    const db = await seed();
    const config: Config = { ...DEFAULT_CONFIG, hourlyRate: 120, minutesPerUseDefault: 5 };
    const { skills } = getSkills(db, config, catalog);
    const byName = Object.fromEntries(skills.map((s) => [s.name, s]));

    // caveman: 2 usos · 5 min · $120/h / 60 = $20
    expect(byName.caveman.uses).toBe(2);
    expect(byName.caveman.savedUsd).toBeCloseTo(20, 6);
    expect(byName.caveman.category).toBe("skill");
    expect(byName.caveman.inCatalog).toBe(true);

    // /model = builtin => categoria sistema
    expect(byName.model.category).toBe("sistema");
    // frontend-design (Skill tool_use) no esta en el catalogo de prueba => otro
    expect(byName["frontend-design"].category).toBe("otro");
    // skill del catalogo sin uso aparece en gris (uses 0)
    expect(byName["other-skill"].uses).toBe(0);
    expect(byName["other-skill"].savedUsd).toBe(0);
    db.close();
  });

  it("tarifa/hora 0 => ahorro 0 (como capturas)", async () => {
    const db = await seed();
    const { skills } = getSkills(db, { ...DEFAULT_CONFIG, minutesPerUseDefault: 30 }, catalog);
    expect(skills.every((s) => s.savedUsd === 0)).toBe(true);
    db.close();
  });
});

describe("config round-trip", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "motor-cfg-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("saveConfig hace merge y loadConfig lo recupera", async () => {
    const path = join(tmp, "config.json");
    const saved = await saveConfig({ hourlyRate: 90, minutesPerUse: { caveman: 8 } }, path);
    expect(saved.hourlyRate).toBe(90);
    expect(saved.staleDays).toBe(DEFAULT_CONFIG.staleDays); // default preservado
    const loaded = await loadConfig(path);
    expect(loaded.hourlyRate).toBe(90);
    expect(loaded.minutesPerUse.caveman).toBe(8);
  });

  it("loadConfig sin archivo => defaults sin lanzar", async () => {
    const loaded = await loadConfig(join(tmp, "no-existe.json"));
    expect(loaded).toEqual(DEFAULT_CONFIG);
  });

  it("una config antigua sin waste lo agrega al guardarla", async () => {
    const path = join(tmp, "config.json");
    writeFileSync(path, `${JSON.stringify({ hourlyRate: 90 })}\n`);
    expect((await loadConfig(path)).waste).toEqual(DEFAULT_CONFIG.waste);
    await saveConfig({ staleDays: 7 }, path);
    expect(JSON.parse(readFileSync(path, "utf8")).waste).toEqual(DEFAULT_CONFIG.waste);
  });
});

describe("parseSkillUsages — sin falsos positivos", () => {
  it("un tool_result con <command-name> dentro (contenido de archivo) NO cuenta como uso", () => {
    const raw = readFileSync(join(here, "fixtures", "skill-falsepositive.jsonl"), "utf8");
    const usos = parseSkillUsages(raw);
    expect(usos.map((u) => u.skill)).toEqual(["deploy"]); // solo el comando real
    expect(usos.some((u) => u.skill === "x")).toBe(false); // el del README, no
  });

  it("mencionar /skill en prosa no cuenta como uso", () => {
    const raw = readFileSync(join(here, "fixtures", "skill-falsepositive.jsonl"), "utf8");
    expect(parseSkillUsages(raw).some((u) => u.skill === "ponytail")).toBe(false);
  });
});

describe("discoverCatalog", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "motor-catalog-"));
    const skill = join(tmp, "codex", "skills", "nested", "ponytail");
    mkdirSync(skill, { recursive: true });
    writeFileSync(join(skill, "SKILL.md"), "---\nname: ponytail\ndescription: minimalismo\n---\n");
    const imported = join(tmp, "codex", "skills", "vendor_imports", "skip");
    mkdirSync(imported, { recursive: true });
    writeFileSync(join(imported, "SKILL.md"), "---\nname: no-debe-aparecer\n---\n");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("descubre skills Codex recursivos y marca disponibilidad", async () => {
    const catalog = await discoverCatalog({ claudeRoot: join(tmp, "claude"), codexRoot: join(tmp, "codex") });
    expect(catalog.get("ponytail")?.agents).toEqual(["codex"]);
    expect(catalog.has("no-debe-aparecer")).toBe(false);
  });
});
