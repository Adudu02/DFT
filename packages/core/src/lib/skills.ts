/**
 * Página Skills (PLAN §4.2). Cataloga ~/.claude/skills + commands (RO), cuenta
 * usos desde skills_usage y calcula $ ahorrado = usos·min·tarifa/60. Sin tarifa
 * (o sin minutos) => $0, como en las capturas de referencia.
 */
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { readFileRO, readDirRO } from "./fs-readonly.js";
import type { DB } from "./db.js";
import type { Config } from "./config.js";

export interface CatalogEntry {
  name: string;
  description: string;
  category: string;
  agents?: string[];
}

export interface SkillRow {
  name: string;
  uses: number;
  lastUsed: string | null;
  category: string; // catálogo | "sistema" (builtin) | "otro"
  savedUsd: number;
  minutesPerUse: number;
  inCatalog: boolean;
  availableTo: string[];
  agents: { agent: string; uses: number; savedUsd: number }[];
}

// Comandos nativos de Claude Code => categoría "sistema" (no cuentan como skills).
const BUILTIN = new Set([
  "model", "clear", "help", "init", "review", "compact", "config", "cost",
  "memory", "doctor", "status", "resume", "mcp", "agents", "permissions",
  "hooks", "login", "logout", "bug", "ide", "vim", "terminal-setup",
  "pr-comments", "release-notes", "add-dir", "plugin", "reload-plugins", "fast",
]);

function frontmatter(raw: string): Record<string, string> {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Recorre los catálogos instalados de Claude Code y Codex (RO). */
export async function discoverCatalog(
  roots: { claudeRoot?: string; codexRoot?: string } = {},
): Promise<Map<string, CatalogEntry>> {
  const catalog = new Map<string, CatalogEntry>();
  const add = (name: string, description: string, category: string, agent: string) => {
    const current = catalog.get(name);
    catalog.set(name, {
      name,
      description: current?.description || description,
      category: current?.category || category,
      agents: [...new Set([...(current?.agents ?? []), agent])].sort(),
    });
  };
  const readSkill = async (file: string, fallback: string, category: string, agent: string) => {
    let raw: string;
    try {
      raw = await readFileRO(file);
    } catch {
      return;
    }
    const fm = frontmatter(raw);
    add(fm.name || fallback, fm.description ?? "", fm.category || category, agent);
  };

  const claudeRoot = roots.claudeRoot ?? join(homedir(), ".claude");
  for (const [sub, category] of [["skills", "skill"], ["commands", "comando"]] as const) {
    const dir = join(claudeRoot, sub);
    let entries: Dirent[];
    try {
      entries = await readDirRO(dir);
    } catch {
      continue;
    }
    for (const e of entries) {
      // Soporta tanto `commands/x.md` como `skills/x/SKILL.md`.
      const file = e.isDirectory() ? join(dir, e.name, "SKILL.md") : join(dir, e.name);
      if (!e.isDirectory() && !e.name.endsWith(".md")) continue;
      await readSkill(file, e.name.replace(/\.md$/, ""), category, "claude-code");
    }
  }

  async function scanCodex(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readDirRO(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "vendor_imports") await scanCodex(path);
      else if (entry.isFile() && entry.name === "SKILL.md") await readSkill(path, basename(dir), "skill", "codex");
    }
  }
  await scanCodex(join(roots.codexRoot ?? join(homedir(), ".codex"), "skills"));
  return catalog;
}

export function getSkills(
  db: DB,
  config: Config,
  catalog: Map<string, CatalogEntry>,
): { skills: SkillRow[]; categories: Record<string, number> } {
  const used = db
    .prepare(
      "SELECT skill, COUNT(*) AS uses, MAX(ts) AS lastUsed FROM skills_usage GROUP BY skill",
    )
    .all() as { skill: string; uses: number; lastUsed: string | null }[];

  const usesByName = new Map(used.map((r) => [r.skill, r]));
  const usedByAgent = db
    .prepare(`
      SELECT su.skill, s.agent, COUNT(*) AS uses
      FROM skills_usage su JOIN sessions s ON s.id = su.session_id
      GROUP BY su.skill, s.agent
    `)
    .all() as { skill: string; agent: string; uses: number }[];
  const agentsBySkill = new Map<string, { agent: string; uses: number }[]>();
  for (const row of usedByAgent) {
    const agents = agentsBySkill.get(row.skill) ?? [];
    agents.push(row);
    agentsBySkill.set(row.skill, agents);
  }
  const names = new Set<string>([...usesByName.keys(), ...catalog.keys()]);

  const skills: SkillRow[] = [];
  for (const name of names) {
    const u = usesByName.get(name);
    const uses = u?.uses ?? 0;
    const cat = catalog.get(name);
    const category = cat ? cat.category : BUILTIN.has(name) ? "sistema" : "otro";
    const minutesPerUse = config.minutesPerUse[name] ?? config.minutesPerUseDefault;
    const savedUsd = (uses * minutesPerUse * config.hourlyRate) / 60;
    const agents = (agentsBySkill.get(name) ?? [])
      .map((a) => ({ agent: a.agent, uses: a.uses, savedUsd: (a.uses * minutesPerUse * config.hourlyRate) / 60 }))
      .sort((a, b) => b.uses - a.uses || a.agent.localeCompare(b.agent));
    skills.push({
      name,
      uses,
      lastUsed: u?.lastUsed ?? null,
      category,
      savedUsd,
      minutesPerUse,
      inCatalog: !!cat,
      availableTo: cat?.agents ?? [],
      agents,
    });
  }

  skills.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));

  const categories: Record<string, number> = {};
  for (const s of skills) categories[s.category] = (categories[s.category] ?? 0) + s.uses;

  return { skills, categories };
}
