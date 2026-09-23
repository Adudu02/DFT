#!/usr/bin/env node
/**
 * how-much-did-u-waste-report — segundo consumidor de how-much-did-u-waste-core (sin
 * servidor ni UI). Ingiere (opcional) los transcripts, corre la detección de
 * fugas y emite un reporte legible o JSON. Con --threshold falla (exit 1) si el
 * desperdicio estimado lo supera, para gatear un PR/CI.
 *
 *   how-much-did-u-waste-report                       # reporte de la DB existente
 *   how-much-did-u-waste-report --ingest              # ingiere primero, luego reporta
 *   how-much-did-u-waste-report --data ./x --json     # estado en ./x, salida JSON
 *   how-much-did-u-waste-report --threshold 50        # exit 1 si fuga > $50
 */
import {
  defaultDbPath,
  ensureUserData,
  loadPricing,
  openDb,
  setDataDir,
} from "how-much-did-u-waste-core";
import { getWaste, loadConfig, rebuild } from "how-much-did-u-waste-insights";
import { exceedsThreshold, parseArgs, type ReportResult, toJson, toText } from "./report.js";

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
