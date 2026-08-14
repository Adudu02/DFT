/** Agregación gasto/modelo/día para el CLI de Fase 1 (PLAN §6-F1). */
import type { NormalizedSession } from "../adapters/types.js";
import { costForEvent } from "./cost.js";
import { getRate, UnknownModels, type Pricing } from "./pricing.js";

export interface Row {
  day: string;
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  costUsd: number;
}

export interface Totals {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  costUsd: number;
}

export function aggregate(
  sessions: NormalizedSession[],
  pricing: Pricing,
): { rows: Row[]; total: Totals; unknownModels: string[] } {
  const unknown = new UnknownModels();
  const byKey = new Map<string, Row>();

  for (const s of sessions) {
    for (const e of s.events) {
      const key = `${e.day}\u0000${e.model}`;
      let r = byKey.get(key);
      if (!r) {
        r = { day: e.day, model: e.model, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, costUsd: 0 };
        byKey.set(key, r);
      }
      r.input += e.input;
      r.output += e.output;
      r.cacheWrite += e.cacheWrite;
      r.cacheRead += e.cacheRead;
      r.costUsd += costForEvent(e, getRate(pricing, e.model, unknown));
    }
  }

  const rows = [...byKey.values()].sort((a, b) =>
    a.day !== b.day ? a.day.localeCompare(b.day) : a.model.localeCompare(b.model),
  );

  const total: Totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, costUsd: 0 };
  for (const r of rows) {
    total.input += r.input;
    total.output += r.output;
    total.cacheWrite += r.cacheWrite;
    total.cacheRead += r.cacheRead;
    total.costUsd += r.costUsd;
  }

  return { rows, total, unknownModels: unknown.list() };
}
