/**
 * Reporte de auto-mejora (PLAN §5). Al final de cada ingesta REAL (rebuild /
 * serve) se escribe ./data/reports/run-<ts>.json con lo que falló o quedó sin
 * cubrir: líneas no parseables, modelos sin tarifa, adapters sin datos y
 * tiempos. `pnpm improve` lee el último y corrige el código del dashboard
 * (nunca las fuentes).
 */
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readFileRO } from "./fs-readonly.js";
import { dataDir } from "./paths.js";
import type { IngestSummary } from "../ingest.js";

export interface IngestReport extends IngestSummary {
  ts: string;
  durationMs: number;
  adaptersWithoutData: string[];
}

function defaultReportsDir(): string {
  return join(dataDir(), "reports");
}

export async function writeReport(
  summary: IngestSummary,
  opts: { durationMs?: number; dir?: string } = {},
): Promise<{ path: string; report: IngestReport }> {
  const dir = opts.dir ?? defaultReportsDir();
  await mkdir(dir, { recursive: true });
  const report: IngestReport = {
    ...summary,
    ts: new Date().toISOString(),
    durationMs: opts.durationMs ?? 0,
    // Con solo el adapter Claude Code: "sin datos" = no encontró ningún transcript.
    adaptersWithoutData: summary.files === 0 ? ["claude-code"] : [],
  };
  const path = join(dir, `run-${report.ts.replace(/[:.]/g, "-")}.json`);
  await writeFile(path, JSON.stringify(report, null, 2) + "\n", "utf8");
  return { path, report };
}

/** Ruta del reporte más reciente, o null si no hay ninguno. */
export async function latestReport(dir = defaultReportsDir()): Promise<{ path: string; report: IngestReport } | null> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.startsWith("run-") && f.endsWith(".json"));
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  files.sort(); // el ts va en el nombre => orden lexicográfico = cronológico
  const path = join(dir, files[files.length - 1]);
  return { path, report: JSON.parse(await readFileRO(path)) as IngestReport };
}

/** ¿Hay algo que el loop de mejora deba atender? */
export function hasFindings(r: IngestReport): boolean {
  return r.unparseableLines > 0 || r.unknownModels.length > 0 || r.adaptersWithoutData.length > 0;
}
