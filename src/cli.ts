/**
 * CLI: descubre transcripts de TODOS los agentes (Claude Code + Codex, SOLO
 * LECTURA), agrega por dia/modelo e imprime la tabla de gasto "equivalente API".
 *
 *   pnpm cli            # usa las rutas por defecto / config.agentPaths
 *   pnpm cli -- <root>  # sobreescribe la raiz de projects de Claude Code
 *   pnpm cli -- --waste # imprime dónde se fugan tokens (todos los agentes)
 */
import { ClaudeCodeAdapter } from "./adapters/claude-code.js";
import { CodexAdapter } from "./adapters/codex.js";
import { rootsFromConfig } from "./adapters/registry.js";
import { loadPricing } from "./lib/pricing.js";
import { aggregate, type Row } from "./lib/aggregate.js";
import { openDb, defaultDbPath } from "./lib/db.js";
import { ingestAll } from "./ingest.js";
import { loadConfig } from "./lib/config.js";
import { getWaste, type WasteFinding } from "./lib/waste.js";
import { ensureUserData } from "./lib/paths.js";
import type { NormalizedSession } from "./adapters/types.js";

interface Adapter {
  discoverSessions(): Promise<string[]>;
  parseSession(path: string): Promise<NormalizedSession>;
}

/** Descubre y parsea todas las sesiones de un adapter (errores por archivo se avisan). */
async function collectSessions(adapter: Adapter): Promise<{ sessions: NormalizedSession[]; files: number }> {
  const paths = await adapter.discoverSessions();
  const sessions: NormalizedSession[] = [];
  for (const p of paths) {
    try {
      sessions.push(await adapter.parseSession(p));
    } catch (err) {
      console.error(`! no se pudo parsear ${p}: ${(err as Error).message}`);
    }
  }
  return { sessions, files: paths.length };
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}
function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function pad(s: string, w: number, right = false): string {
  return right ? s.padStart(w) : s.padEnd(w);
}

function printTable(rows: Row[], total: Aggregated["total"]): void {
  const headers = ["DIA", "MODELO", "in", "out", "cache-w", "cache-r", "$ equiv-API"];
  const data = rows.map((r) => [
    r.day,
    r.model,
    fmtInt(r.input),
    fmtInt(r.output),
    fmtInt(r.cacheWrite),
    fmtInt(r.cacheRead),
    fmtUsd(r.costUsd),
  ]);
  const totalRow = [
    "TOTAL",
    "",
    fmtInt(total.input),
    fmtInt(total.output),
    fmtInt(total.cacheWrite),
    fmtInt(total.cacheRead),
    fmtUsd(total.costUsd),
  ];

  const all = [headers, ...data, totalRow];
  const widths = headers.map((_, c) => Math.max(...all.map((row) => row[c].length)));
  const rightAlign = [false, false, true, true, true, true, true];

  const renderRow = (row: string[]) =>
    row.map((cell, c) => pad(cell, widths[c], rightAlign[c])).join("  ");

  const sep = widths.map((w) => "-".repeat(w)).join("  ");

  console.log(renderRow(headers));
  console.log(sep);
  for (const row of data) console.log(renderRow(row));
  console.log(sep);
  console.log(renderRow(totalRow));
}

type Aggregated = ReturnType<typeof aggregate>;

const WASTE_TAG: Record<WasteFinding["kind"], string> = {
  "cache-miss": "CACHE",
  "session-bloat": "BLOAT",
  "model-mismatch": "MODEL",
};

function printWasteFinding(f: WasteFinding): void {
  const tag = WASTE_TAG[f.kind];
  const save = f.estUsd ? ` · ahorro ~${fmtUsd(f.estUsd)}` : "";
  console.log(`[${tag}] ${f.project}/${f.sessionId}${save}`);
  console.log(`  ${f.title}`);
  console.log(`  ${f.detail}`);
}

/** F-waste: abre la DB (cache), ingesta TODOS los agentes e imprime las fugas. */
async function runWaste(roots: { projectsRoot?: string; codexRoot: string }): Promise<void> {
  const pricing = await loadPricing();
  const config = await loadConfig();
  const db = openDb(defaultDbPath());
  try {
    await ingestAll(db, { ...roots, pricing, staleDays: config.staleDays });
    const { findings, totalEstUsd } = getWaste(db, pricing, config.waste);
    if (findings.length === 0) {
      console.log("Sin fugas detectadas con los umbrales actuales (data/config.json → waste).");
      return;
    }
    console.log(`Fugas de tokens (${findings.length}) · ahorro estimado ~${fmtUsd(totalEstUsd)}\n`);
    for (const f of findings) {
      printWasteFinding(f);
      console.log("");
    }
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  ensureUserData();
  const args = process.argv.slice(2);
  const wasteMode = args.includes("--waste");
  const rootArg = args.find((a) => !a.startsWith("--"));

  // Rutas: arg posicional sobreescribe la de Claude Code; el resto sale de
  // config.agentPaths (con defaults). Codex siempre incluido.
  const config = await loadConfig();
  const roots = rootsFromConfig(config.agentPaths);
  const claudeRoot = rootArg ?? roots.projectsRoot;

  if (wasteMode) return runWaste({ projectsRoot: claudeRoot, codexRoot: roots.codexRoot });

  const pricing = await loadPricing();
  const claude = await collectSessions(new ClaudeCodeAdapter(claudeRoot));
  const codex = await collectSessions(new CodexAdapter(roots.codexRoot));
  const sessions = [...claude.sessions, ...codex.sessions];
  const files = claude.files + codex.files;

  const { rows, total, unknownModels } = aggregate(sessions, pricing);

  const eventCount = sessions.reduce((n, s) => n + s.events.length, 0);
  console.log(
    `Transcripts: ${files} archivos · ${sessions.length} sesiones · ${eventCount} eventos de uso` +
      ` (claude-code: ${claude.files} · codex: ${codex.files})`,
  );
  console.log("Costos = equivalente API (tarifa medida; no lo que pagas por suscripcion)\n");

  if (rows.length === 0) {
    console.log("(sin eventos de uso)");
  } else {
    printTable(rows, total);
  }

  if (unknownModels.length > 0) {
    console.log(
      `\n⚠ ${unknownModels.length} modelos sin tarifa (costo 0): ${unknownModels.join(", ")}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
