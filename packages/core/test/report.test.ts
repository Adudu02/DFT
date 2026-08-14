import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { loadPricing } from "../src/lib/pricing.js";
import { writeReport, latestReport, hasFindings, type IngestReport } from "../src/lib/report.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "motor-report-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("reporte de auto-mejora", () => {
  it("ingesta cuenta líneas no parseables (deterministic tiene 1 corrupta)", async () => {
    const dir = join(tmp, "projA");
    mkdirSync(dir, { recursive: true });
    copyFileSync(fx("deterministic.jsonl"), join(dir, "s1.jsonl"));
    const db = openDb(join(tmp, "motor.db"));
    const summary = await ingestAll(db, { projectsRoot: tmp, pricing: await loadPricing() });
    db.close();
    expect(summary.unparseableLines).toBe(1);
    expect(summary.unknownModels).toEqual(["claude-ghost-9"]);
  });

  it("writeReport + latestReport round-trip y hasFindings detecta hallazgos", async () => {
    const reports = join(tmp, "reports");
    const base = {
      files: 1, filesChanged: 1, eventsInserted: 4, memories: 0,
      unknownModels: ["claude-ghost-9"], unparseableLines: 1,
    };
    const { path, report } = await writeReport(base, { durationMs: 42, dir: reports });
    expect(path).toContain("run-");
    expect(report.durationMs).toBe(42);
    expect(hasFindings(report)).toBe(true);

    const latest = await latestReport(reports);
    expect(latest?.report.unparseableLines).toBe(1);
    expect(latest?.report.unknownModels).toEqual(["claude-ghost-9"]);
  });

  it("hasFindings false cuando no hay nada que atender", () => {
    const clean: IngestReport = {
      ts: "2026-07-12T00:00:00.000Z", durationMs: 10,
      files: 3, filesChanged: 0, eventsInserted: 0, memories: 2,
      unknownModels: [], unparseableLines: 0, adaptersWithoutData: [],
    };
    expect(hasFindings(clean)).toBe(false);
  });

  it("adaptersWithoutData se marca cuando no hay transcripts", async () => {
    const { report } = await writeReport(
      { files: 0, filesChanged: 0, eventsInserted: 0, memories: 0, unknownModels: [], unparseableLines: 0 },
      { dir: join(tmp, "r2") },
    );
    expect(report.adaptersWithoutData).toEqual(["claude-code"]);
    expect(hasFindings(report)).toBe(true);
  });
});
