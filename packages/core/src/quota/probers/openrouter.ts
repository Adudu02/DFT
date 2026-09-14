/**
 * Prober OpenRouter (Fase 2, fixture-driven): GET `openrouter.ai/api/v1/key`
 * con la inference API key (env OPENROUTER_API_KEY o config). Key-level
 * (crédito, no per-model): `data.{usage, limit, limit_remaining,
 * is_free_tier}` → porcentaje de crédito usado.
 */
import type { ProberContext, QuotaSnapshot } from "../types.js";

const KEY_URL = "https://openrouter.ai/api/v1/key";

/** Parser puro (fixture-driven). */
export function parseOpenRouterKey(data: unknown, now: Date): QuotaSnapshot[] {
  const d = (data as Record<string, any>)?.data;
  if (!d || typeof d !== "object") return [];
  const usage = d.usage;
  const limit = d.limit;
  if (typeof usage !== "number" || typeof limit !== "number" || limit <= 0) return [];
  return [
    {
      provider: "openrouter",
      window: "credit",
      usedPercent: Math.min(100, Math.round((usage / limit) * 100)),
      limit,
      remaining: typeof d.limit_remaining === "number" ? d.limit_remaining : undefined,
      plan: d.is_free_tier === true ? "free" : undefined,
      fetchedAt: now.toISOString(),
      origin: "live",
    },
  ];
}

export async function probeOpenRouter(ctx: ProberContext): Promise<QuotaSnapshot[]> {
  const key = ctx.openrouterApiKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("no-credential: falta la API key (env OPENROUTER_API_KEY)");
  const res = await ctx.fetchImpl(KEY_URL, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(ctx.timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${KEY_URL}`);
  const snaps = parseOpenRouterKey(await res.json(), ctx.now());
  if (!snaps.length) throw new Error("respuesta sin data.usage/limit reconocidos");
  return snaps;
}
