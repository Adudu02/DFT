import type { WasteFinding } from "motor-agentico-core";
import { describe, expect, it } from "vitest";
import { exceedsThreshold, type ReportResult, toJson } from "../src/report.js";

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
