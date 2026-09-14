/**
 * Prober Z.ai GLM (Fase 1): `GET api.z.ai/api/monitor/usage/quota/limit` con la
 * API key del plan (`id.secret`, vía config/env — la credencial de ZCode está
 * cifrada). Endpoint no documentado; el parser tolera DOS formas:
 *  - A: `data.limits[] {type, percentage, unit (3=h,6=semanas,4=días,5=meses), number, nextResetTime}`;
 *  - B: `data.total_usage {used, limit, remaining}` (epoch-seg).
 */
import type { ProberContext, QuotaSnapshot } from "../types.js";

const USAGE_URL = "https://api.z.ai/api/monitor/usage/quota/limit";

function snap(partial: Omit<QuotaSnapshot, "provider" | "fetchedAt" | "origin">, now: Date): QuotaSnapshot {
  return { provider: "zai", fetchedAt: now.toISOString(), origin: "live", ...partial };
}

/** unit 3=h, 4=días, 5=meses, 6=semanas → ventana normalizada. */
export function mapZaiWindow(unit: number, number: number): string {
  if (unit === 3) return number === 5 ? "five_hour" : `${number}h`;
  if (unit === 6) return "weekly";
  if (unit === 4) return `${number}d`;
  if (unit === 5) return "monthly";
  return `unit-${unit}-${number}`;
}

/** Parser puro tolerante a ambas formas (testeado con fixtures). */
export function parseZaiUsage(data: unknown, now: Date): QuotaSnapshot[] {
  const out: QuotaSnapshot[] = [];
  const d = (data as Record<string, any>)?.data;
  if (!d || typeof d !== "object") return out;

  if (Array.isArray(d.limits)) {
    for (const l of d.limits) {
      if (!l || typeof l !== "object" || typeof l.percentage !== "number") continue;
      const window = typeof l.unit === "number" && typeof l.number === "number" ? mapZaiWindow(l.unit, l.number) : "unknown";
      const resetsAt =
        typeof l.nextResetTime === "number" ? new Date(l.nextResetTime).toISOString() : undefined;
      out.push(snap({ window, usedPercent: l.percentage, resetsAt }, now));
    }
  }

  if (d.total_usage && typeof d.total_usage === "object") {
    const t = d.total_usage;
    if (typeof t.used === "number" && typeof t.limit === "number" && t.limit > 0) {
      out.push(
        snap(
          {
            window: "monthly",
            usedPercent: Math.round((t.used / t.limit) * 100),
            limit: t.limit,
            remaining: typeof t.remaining === "number" ? t.remaining : undefined,
            resetsAt: typeof d.reset_time === "number" ? new Date(d.reset_time * 1000).toISOString() : undefined,
          },
          now,
        ),
      );
    }
  }
  return out;
}

export async function probeZai(ctx: ProberContext): Promise<QuotaSnapshot[]> {
  const key = ctx.zaiApiKey ?? process.env.ZAI_API_KEY;
  if (!key) throw new Error("no-credential: configurá quota.providers.zaiApiKey en config.json o la env ZAI_API_KEY");
  const res = await ctx.fetchImpl(USAGE_URL, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(ctx.timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${USAGE_URL}`);
  const snapshots = parseZaiUsage(await res.json(), ctx.now());
  if (!snapshots.length) throw new Error("respuesta sin límites reconocidos (formas A/B)");
  return snapshots;
}
