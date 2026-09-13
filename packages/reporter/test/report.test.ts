import type { WasteFinding } from "motor-agentico-core";
import { describe, expect, it } from "vitest";
import { exceedsThreshold, type ReportResult, parseArgs, toJson, toText } from "../src/report.js";

const finding = (estUsd: number): WasteFinding =>
  ({
    kind: "model-mismatch",
    project: "demo",
    sessionId: "s1",
    title: "turnos triviales en opus",
    detail: "sonnet bastaba",
    estUsd,
  }) as WasteFinding;

const result: ReportResult = {
  totalEstUsd: 60,
  count: 2,
  findings: [finding(40), finding(20)],
};

describe("exceedsThreshold", () => {
  it("sin umbral nunca falla", () => {
    expect(exceedsThreshold(999, null)).toBe(false);
  });
  it("falla solo si supera el umbral (estricto)", () => {
    expect(exceedsThreshold(60, 50)).toBe(true);
    expect(exceedsThreshold(50, 50)).toBe(false);
    expect(exceedsThreshold(40, 50)).toBe(false);
  });
});

describe("toJson", () => {
  it("resume total, count, exceeded y aplana los hallazgos", () => {
    const j = toJson(result, 50);
    expect(j.totalEstUsd).toBe(60);
    expect(j.count).toBe(2);
    expect(j.exceeded).toBe(true);
    expect(j.findings[0]).toMatchObject({ kind: "model-mismatch", project: "demo", estUsd: 40 });
  });
});

describe("toText", () => {
  it("resume con total a 2 decimales y lista cada hallazgo con su ahorro", () => {
    const t = toText(result, null);
    expect(t).toContain("Fugas: 2 · ahorro estimado ~$60.00");
    expect(t).toContain("[model-mismatch] demo/s1 · ~$40.00 — turnos triviales en opus");
    expect(t).toContain("[model-mismatch] demo/s1 · ~$20.00 — turnos triviales en opus");
    expect(t).not.toContain("umbral");
  });

  it("omite el ahorro cuando el hallazgo no tiene estimado", () => {
    const sinEstimado: ReportResult = {
      totalEstUsd: 0,
      count: 1,
      findings: [{ ...finding(0), estUsd: null } as unknown as WasteFinding],
    };
    const t = toText(sinEstimado, null);
    // La fila del hallazgo (indentada con 2 espacios) no lleva «· ~$…» (el resumen sí muestra ~$0.00).
    expect(t.split("\n")[1]).toBe("  [model-mismatch] demo/s1 — turnos triviales en opus");
  });

  it("trunca a 20 hallazgos con «… y N más»", () => {
    const many: ReportResult = {
      totalEstUsd: 210,
      count: 25,
      findings: Array.from({ length: 25 }, (_, i) => finding(10)),
    };
    const t = toText(many, null);
    expect(t).toContain("… y 5 más");
  });

  it("marca el umbral solo cuando se supera", () => {
    expect(toText(result, 50)).toContain("✗ supera el umbral de $50.00");
    expect(toText(result, null)).not.toContain("umbral");
    expect(toText(result, 60)).not.toContain("supera el umbral");
  });
});

describe("parseArgs", () => {
  it("defaults sin flags: threshold null y booleanos en falso", () => {
    expect(parseArgs([])).toEqual({ data: undefined, json: false, ingest: false, threshold: null });
  });

  it("lee booleanos --json/--ingest", () => {
    expect(parseArgs(["--json", "--ingest"])).toMatchObject({ json: true, ingest: true, threshold: null });
  });

  it("lee valores --data/--threshold", () => {
    expect(parseArgs(["--data", "/tmp/x", "--threshold", "50"])).toEqual({
      data: "/tmp/x",
      json: false,
      ingest: false,
      threshold: 50,
    });
  });
});
