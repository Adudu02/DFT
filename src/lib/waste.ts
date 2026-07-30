/**
 * Motor de "desperdicio" (PLAN §waste / UC1+UC3): a diferencia del resto del
 * dashboard —que MIDE el gasto— este módulo señala DÓNDE se fugan tokens y qué
 * hacer, que es el objetivo del usuario (gastar menos). Lee la DB ya ingerida.
 *
 * Hallazgos:
 *  - cache-miss (UC1): sesión con baja tasa de acierto de caché ⇒ el contexto se
 *    reenvía como `input` crudo (1×) en vez de leerse de caché (0.10×). El ahorro
 *    estimado es ese input a la diferencia de tarifa.
 *  - session-bloat (UC3): sesión enorme (muchos turnos o tokens) ⇒ cada turno
 *    re-paga el contexto. Informativo: se reporta el tamaño y se recomienda
 *    partir; no se inventa un $ (partir depende del usuario).
 *  - model-mismatch (UC2): modelo caro en turnos triviales (poca salida) ⇒ un
 *    modelo más barato habría bastado. Ahorro = costo real − costo a la tarifa
 *    del modelo destino sobre los mismos tokens.
 */
import type { DB } from "./db.js";
import { costForEvent } from "./cost.js";
import { getRate, type Pricing } from "./pricing.js";
import type { UsageEvent } from "../adapters/types.js";

export interface WasteThresholds {
  minCacheRatio: number; // por debajo => posible cache-miss
  minInputTokens: number; // piso de input para que valga la pena señalar
  bloatTurns: number; // turnos desde los que una sesión se considera inflada
  bloatTokens: number; // o tokens totales desde los que se infla
  expensiveInputRate: number; // tarifa input desde la que un modelo es "caro"
  trivialOutputTokens: number; // salida por turno bajo la cual el turno es trivial
  mismatchMinTurns: number; // min. turnos triviales para señalar mismatch
  downgradeModel: string; // modelo destino sugerido para el downgrade
}

export const DEFAULT_WASTE: WasteThresholds = {
  minCacheRatio: 0.7,
  minInputTokens: 200_000,
  bloatTurns: 100,
  bloatTokens: 20_000_000,
  expensiveInputRate: 5.0,
  trivialOutputTokens: 2_000,
  mismatchMinTurns: 3,
  downgradeModel: "claude-sonnet-5",
};

// ponytail: ahorro de cache-miss = input * rate.input * (1 - 0.10). Es un techo:
// parte del `input` es el mensaje nuevo genuino (no cacheable). Ajustá
// CACHE_SAVE_FACTOR o los umbrales en config si sobre/subestima en tus datos.
const CACHE_READ_MULT = 0.1;
const CACHE_SAVE_FACTOR = 1 - CACHE_READ_MULT;

export type WasteKind = "cache-miss" | "session-bloat" | "model-mismatch";

export interface WasteFinding {
  kind: WasteKind;
  sessionId: string;
  project: string;
  day: string; // día de la sesión (último día con actividad) — para la tendencia
  title: string; // recomendación en una línea
  detail: string; // los números que la sustentan
  estUsd?: number; // ahorro estimado; ausente = informativo
  estTokens?: number;
  metrics: {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
    turns: number;
    cacheHitRatio: number;
  };
}

export interface WasteTrendPoint {
  day: string;
  estUsd: number; // ahorro estimado atribuible a sesiones de ese día
  findings: number;
}

export interface WasteReport {
  findings: WasteFinding[]; // rankeadas: mayor impacto primero
  totalEstUsd: number;
  totalEstTokens: number;
  trend: WasteTrendPoint[]; // UC5: ahorro estimado por día (asc.)
  thresholds: WasteThresholds;
}

interface Row {
  sessionId: string;
  project: string;
  day: string;
  turns: number;
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  costUsd: number;
}

interface SessionAgg {
  sessionId: string;
  project: string;
  day: string;
  turns: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  cacheSaveUsd: number; // ahorro potencial si el input fuera cache-read
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function getWaste(
  db: DB,
  pricing: Pricing,
  thresholds: WasteThresholds = DEFAULT_WASTE,
): WasteReport {
  const rows = db
    .prepare(
      `SELECT u.session_id AS sessionId, s.project AS project, s.turns AS turns, u.model AS model,
              MAX(u.day) AS day,
              SUM(u.input_tokens) AS input, SUM(u.output_tokens) AS output,
              SUM(u.cache_write_tokens) AS cacheWrite, SUM(u.cache_read_tokens) AS cacheRead,
              SUM(u.cost_usd) AS costUsd
       FROM usage_events u JOIN sessions s ON s.id = u.session_id
       GROUP BY u.session_id, u.model`,
    )
    .all() as unknown as Row[];

  // Agrupa filas (sesión,modelo) en sesiones; el ahorro de caché se acumula por
  // modelo porque depende de la tarifa (modelo sin tarifa => sin estimación).
  const bySession = new Map<string, SessionAgg>();
  for (const r of rows) {
    let a = bySession.get(r.sessionId);
    if (!a) {
      a = {
        sessionId: r.sessionId,
        project: r.project,
        day: r.day,
        turns: r.turns,
        input: 0,
        output: 0,
        cacheWrite: 0,
        cacheRead: 0,
        cacheSaveUsd: 0,
      };
      bySession.set(r.sessionId, a);
    }
    if (r.day > a.day) a.day = r.day; // último día con actividad de la sesión
    a.input += r.input;
    a.output += r.output;
    a.cacheWrite += r.cacheWrite;
    a.cacheRead += r.cacheRead;
    const rate = getRate(pricing, r.model);
    if (rate) a.cacheSaveUsd += (r.input * rate.input * CACHE_SAVE_FACTOR) / 1_000_000;
  }

  const findings: WasteFinding[] = [];
  for (const a of bySession.values()) {
    const reads = a.cacheRead + a.input;
    const cacheHitRatio = reads > 0 ? a.cacheRead / reads : 1;
    const metrics = {
      input: a.input,
      output: a.output,
      cacheWrite: a.cacheWrite,
      cacheRead: a.cacheRead,
      turns: a.turns,
      cacheHitRatio,
    };

    // UC1 — cache-miss
    if (
      a.input >= thresholds.minInputTokens &&
      cacheHitRatio < thresholds.minCacheRatio &&
      a.cacheSaveUsd > 0
    ) {
      findings.push({
        kind: "cache-miss",
        sessionId: a.sessionId,
        project: a.project,
        day: a.day,
        title: `Contexto reenviado sin caché (${(cacheHitRatio * 100).toFixed(0)}% de acierto)`,
        detail: `${fmtTokens(a.input)} tokens de input crudo. Evitá reinicios de contexto (/clear) a mitad de tarea; mantené estable lo que va en contexto.`,
        estUsd: a.cacheSaveUsd,
        estTokens: a.input,
        metrics,
      });
    }

    // UC3 — session-bloat (informativo: sin $ inventado)
    const totalTokens = a.input + a.output + a.cacheWrite + a.cacheRead;
    if (a.turns >= thresholds.bloatTurns || totalTokens >= thresholds.bloatTokens) {
      findings.push({
        kind: "session-bloat",
        sessionId: a.sessionId,
        project: a.project,
        day: a.day,
        title: `Sesión inflada (${a.turns} turnos, ${fmtTokens(totalTokens)} tokens)`,
        detail: `Cada turno re-paga el contexto acumulado. Partí la tarea en sesiones nuevas para dejar de re-pagar contexto viejo.`,
        estTokens: totalTokens,
        metrics,
      });
    }
  }

  // UC2 — model-mismatch: turnos triviales (poca salida) en un modelo caro. Se
  // agrega por (sesión,modelo) SOLO sobre eventos triviales.
  const target = getRate(pricing, thresholds.downgradeModel);
  if (target) {
    const trivialRows = db
      .prepare(
        `SELECT u.session_id AS sessionId, s.project AS project, u.model AS model,
                MAX(u.day) AS day, COUNT(*) AS turns,
                SUM(u.input_tokens) AS input, SUM(u.output_tokens) AS output,
                SUM(u.cache_write_tokens) AS cacheWrite, SUM(u.cache_read_tokens) AS cacheRead,
                SUM(u.cost_usd) AS costUsd
         FROM usage_events u JOIN sessions s ON s.id = u.session_id
         WHERE u.output_tokens <= ?
         GROUP BY u.session_id, u.model`,
      )
      .all(thresholds.trivialOutputTokens) as unknown as (Row & { turns: number })[];

    for (const r of trivialRows) {
      if (r.model === thresholds.downgradeModel) continue; // ya está en el destino
      const rate = getRate(pricing, r.model);
      if (!rate || rate.input < thresholds.expensiveInputRate) continue; // no es caro (o sin tarifa)
      if (r.turns < thresholds.mismatchMinTurns) continue;

      // costForEvent es lineal en tokens ⇒ vale sobre las sumas del grupo.
      const asEvent = {
        input: r.input,
        output: r.output,
        cacheWrite: r.cacheWrite,
        cacheRead: r.cacheRead,
      } as UsageEvent;
      const targetCost = costForEvent(asEvent, target);
      const estUsd = r.costUsd - targetCost;
      if (estUsd <= 0) continue;

      findings.push({
        kind: "model-mismatch",
        sessionId: r.sessionId,
        project: r.project,
        day: r.day,
        title: `${r.turns} turnos triviales en ${r.model}`,
        detail: `Salida ≤ ${fmtTokens(thresholds.trivialOutputTokens)} tok/turno: ${thresholds.downgradeModel} habría bastado. Cambiá de modelo para trabajo liviano.`,
        estUsd,
        estTokens: r.input + r.output,
        metrics: {
          input: r.input,
          output: r.output,
          cacheWrite: r.cacheWrite,
          cacheRead: r.cacheRead,
          turns: r.turns,
          cacheHitRatio: r.cacheRead + r.input > 0 ? r.cacheRead / (r.cacheRead + r.input) : 1,
        },
      });
    }
  }

  // Ranking: primero por $ estimado, luego por tokens (los informativos caen al
  // final pero ordenados por tamaño).
  findings.sort((x, y) => (y.estUsd ?? 0) - (x.estUsd ?? 0) || (y.estTokens ?? 0) - (x.estTokens ?? 0));

  // UC5 — tendencia: ahorro estimado atribuido al día de cada sesión. Deriva del
  // estado actual (sin snapshots): sesiones viejas caen en su día, así se ve si
  // el desperdicio baja con el tiempo.
  const byDay = new Map<string, WasteTrendPoint>();
  for (const f of findings) {
    if (!f.day) continue;
    let p = byDay.get(f.day);
    if (!p) {
      p = { day: f.day, estUsd: 0, findings: 0 };
      byDay.set(f.day, p);
    }
    p.estUsd += f.estUsd ?? 0;
    p.findings += 1;
  }
  const trend = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  return {
    findings,
    totalEstUsd: findings.reduce((n, f) => n + (f.estUsd ?? 0), 0),
    totalEstTokens: findings.reduce((n, f) => n + (f.estTokens ?? 0), 0),
    trend,
    thresholds,
  };
}
