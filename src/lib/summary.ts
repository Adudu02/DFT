/**
 * Resumen de la página Inicio (PLAN §4.1): gasto equiv. de la ventana + serie
 * diaria, actividad (turnos, Δ% 7d, proyectos), racha de días activos y
 * participación por modelo. Lee de la DB ya ingerida.
 */
import type { DB } from "./db.js";
import type { Pricing } from "./pricing.js";

const DEFAULT_WINDOW_DAYS = 28;
const DAY_MS = 86_400_000;

export interface DailyPoint {
  day: string;
  costUsd: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface ModelShare {
  model: string;
  costUsd: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  known: boolean;
  share: number; // fracción del costo total de la ventana
}

export interface Summary {
  from?: string;
  to?: string;
  windowDays: number;
  totalCostUsd: number;
  totalTokens: number;
  daily: DailyPoint[];
  perModel: ModelShare[];
  activity: { turns: number; projects: number; deltaPct7d: number | null };
  streakDays: number;
  unknownModels: string[];
}

function addDays(day: string, delta: number): string {
  const d = new Date(day + "T00:00:00.000Z");
  return new Date(d.getTime() + delta * DAY_MS).toISOString().slice(0, 10);
}

function emptySummary(windowDays: number): Summary {
  return {
    windowDays,
    totalCostUsd: 0,
    totalTokens: 0,
    daily: [],
    perModel: [],
    activity: { turns: 0, projects: 0, deltaPct7d: null },
    streakDays: 0,
    unknownModels: [],
  };
}

export function getSummary(
  db: DB,
  pricing: Pricing,
  opts: { windowDays?: number } = {},
): Summary {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const last = db.prepare("SELECT MAX(day) AS d FROM usage_events").get() as { d: string | null };
  if (!last.d) return emptySummary(windowDays);

  const to = last.d;
  const from = addDays(to, -(windowDays - 1));

  const daily = db
    .prepare(
      `SELECT day,
              SUM(cost_usd) AS costUsd,
              SUM(input_tokens) AS input, SUM(output_tokens) AS output,
              SUM(cache_write_tokens) AS cacheWrite, SUM(cache_read_tokens) AS cacheRead
       FROM usage_events WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day`,
    )
    .all(from, to) as unknown as DailyPoint[];

  const perModelRows = db
    .prepare(
      `SELECT model,
              SUM(cost_usd) AS costUsd,
              SUM(input_tokens) AS input, SUM(output_tokens) AS output,
              SUM(cache_write_tokens) AS cacheWrite, SUM(cache_read_tokens) AS cacheRead
       FROM usage_events WHERE day BETWEEN ? AND ? GROUP BY model ORDER BY costUsd DESC`,
    )
    .all(from, to) as Omit<ModelShare, "known" | "share">[];

  const totalCostUsd = perModelRows.reduce((n, m) => n + m.costUsd, 0);
  const perModel: ModelShare[] = perModelRows.map((m) => ({
    ...m,
    known: !!pricing.models[m.model],
    share: totalCostUsd > 0 ? m.costUsd / totalCostUsd : 0,
  }));
  const unknownModels = perModel.filter((m) => !m.known).map((m) => m.model);
  const totalTokens = perModelRows.reduce(
    (n, m) => n + m.input + m.output + m.cacheWrite + m.cacheRead,
    0,
  );

  const turns = (
    db
      .prepare("SELECT COUNT(*) AS n FROM usage_events WHERE day BETWEEN ? AND ?")
      .get(from, to) as { n: number }
  ).n;
  const projects = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT s.project) AS n FROM sessions s
         JOIN usage_events u ON u.session_id = s.id WHERE u.day BETWEEN ? AND ?`,
      )
      .get(from, to) as { n: number }
  ).n;

  // Δ% turnos: últimos 7 días vs los 7 previos.
  const last7From = addDays(to, -6);
  const prev7From = addDays(to, -13);
  const prev7To = addDays(to, -7);
  const cnt = (a: string, b: string) =>
    (db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE day BETWEEN ? AND ?").get(a, b) as {
      n: number;
    }).n;
  const last7 = cnt(last7From, to);
  const prev7 = cnt(prev7From, prev7To);
  const deltaPct7d = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : null;

  // Racha: días consecutivos con actividad terminando en `to`.
  const activeDays = new Set(
    (db.prepare("SELECT DISTINCT day FROM usage_events").all() as { day: string }[]).map((r) => r.day),
  );
  let streakDays = 0;
  for (let d = to; activeDays.has(d); d = addDays(d, -1)) streakDays++;

  return {
    from,
    to,
    windowDays,
    totalCostUsd,
    totalTokens,
    daily,
    perModel,
    activity: { turns, projects, deltaPct7d },
    streakDays,
    unknownModels,
  };
}
