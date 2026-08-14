#!/usr/bin/env node
/**
 * motor-agentico-report — segundo consumidor de motor-agentico-core (sin
 * servidor ni UI). Ingiere (opcional) los transcripts, corre la detección de
 * fugas y emite un reporte legible o JSON. Con --threshold falla (exit 1) si el
 * desperdicio estimado lo supera, para gatear un PR/CI.
 *
 *   motor-agentico-report                       # reporte de la DB existente
 *   motor-agentico-report --ingest              # ingiere primero, luego reporta
 *   motor-agentico-report --data ./x --json     # estado en ./x, salida JSON
 *   motor-agentico-report --threshold 50        # exit 1 si fuga > $50
 */
import {
  defaultDbPath,
  ensureUserData,
  getWaste,
  loadConfig,
  loadPricing,
  openDb,
  rebuild,
  setDataDir,
} from "motor-agentico-core";
import { exceedsThreshold, type ReportResult, toJson, toText } from "./report.js";

function parseArgs(argv: string[]) {
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.threshold !== null && Number.isNaN(args.threshold)) {
    console.error("--threshold debe ser un número (USD).");
    process.exit(2);
  }
  if (args.data) setDataDir(args.data);
  ensureUserData();
  if (args.ingest) await rebuild();

  const db = openDb(defaultDbPath());
  try {
    const pricing = await loadPricing();
    const config = await loadConfig();
    const { findings, totalEstUsd } = getWaste(db, pricing, config.waste);
    const result: ReportResult = { totalEstUsd, count: findings.length, findings };
    console.log(args.json ? JSON.stringify(toJson(result, args.threshold), null, 2) : toText(result, args.threshold));
    if (exceedsThreshold(totalEstUsd, args.threshold)) process.exit(1);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
