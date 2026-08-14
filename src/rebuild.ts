/** Entry: borra ./data/motor.db y reingesta todo (PLAN §1.3, comando `rebuild`). */
import { rebuild } from "./ingest.js";
import { writeReport } from "./lib/report.js";
import { ensureUserData } from "./lib/paths.js";

ensureUserData();
const t0 = Date.now();
const summary = await rebuild();
const durationMs = Date.now() - t0;
const { path } = await writeReport(summary, { durationMs });
console.log(
  `rebuild: ${summary.files} archivos · ${summary.eventsInserted} eventos · ${summary.memories} memorias · ${(durationMs / 1000).toFixed(1)}s` +
    (summary.unknownModels.length
      ? `\n⚠ ${summary.unknownModels.length} modelos sin tarifa: ${summary.unknownModels.join(", ")}`
      : "") +
    (summary.unparseableLines ? `\n⚠ ${summary.unparseableLines} líneas no parseables` : "") +
    `\nreporte: ${path}`,
);
