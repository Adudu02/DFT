/**
 * Formateo y decisión de exit-code del reporter. Puro (sin IO): el motor
 * (motor-agentico-core) produce los hallazgos; aquí solo se presentan y se
 * decide si el CI debe fallar.
 */
import type { WasteFinding } from "motor-agentico-core";

export interface ReportResult {
  totalEstUsd: number;
  count: number;
  findings: WasteFinding[];
}

/** ¿El desperdicio supera el umbral? `null` = sin umbral, nunca falla. */
export function exceedsThreshold(totalEstUsd: number, threshold: number | null): boolean {
  return threshold !== null && totalEstUsd > threshold;
}

/** Parsea los flags de la CLI. Pura y exportada para poder testearla sin ejecutar main(). */
export function parseArgs(argv: string[]) {
  const val = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const threshold = val("--threshold");
  return {
    data: val("--data"),
    json: argv.includes("--json"),
    ingest: argv.includes("--ingest"),
    threshold: threshold !== undefined ? Number(threshold) : null,
  };
}

/** Salida machine-readable para consumir en CI. */
export function toJson(r: ReportResult, threshold: number | null) {
  return {
    totalEstUsd: Number(r.totalEstUsd.toFixed(2)),
    count: r.count,
    threshold,
    exceeded: exceedsThreshold(r.totalEstUsd, threshold),
    findings: r.findings.map((f) => ({
      kind: f.kind,
      project: f.project,
      sessionId: f.sessionId,
      estUsd: f.estUsd ?? null,
      title: f.title,
    })),
  };
}

/** Salida legible para terminal / logs de CI. */
export function toText(r: ReportResult, threshold: number | null): string {
  const lines = [`Fugas: ${r.count} · ahorro estimado ~$${r.totalEstUsd.toFixed(2)}`];
  for (const f of r.findings.slice(0, 20)) {
    const save = f.estUsd ? ` · ~$${f.estUsd.toFixed(2)}` : "";
    lines.push(`  [${f.kind}] ${f.project}/${f.sessionId}${save} — ${f.title}`);
  }
  if (r.findings.length > 20) lines.push(`  … y ${r.findings.length - 20} más`);
  if (exceedsThreshold(r.totalEstUsd, threshold)) {
    lines.push(`✗ supera el umbral de $${(threshold ?? 0).toFixed(2)}`);
  }
  return lines.join("\n");
}
