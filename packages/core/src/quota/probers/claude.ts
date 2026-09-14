/**
 * Prober Claude (Fase 1): `GET api.anthropic.com/api/oauth/usage` con el OAuth
 * token de `~/.claude/.credentials.json` (leída con flag 'r'). Endpoint no
 * documentado — el parser es tolerante a DOS formas:
 *  - buckets planos: `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`
 *    con `{utilization: 0–100, resets_at}`;
 *  - schema nuevo: `limits[]` con `kind: session|weekly_all|weekly_scoped`.
 * Errores con causa sanitizada (nunca el token).
 */
import { readFileRO } from "../../lib/fs-readonly.js";
import { homePath } from "../../lib/paths.js";
import type { ProberContext, QuotaSnapshot } from "../types.js";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

interface ClaudeBucket {
  utilization?: number;
  resets_at?: string;
}

/** Windows normalizadas por bucket/kind. */
const FLAT_BUCKETS: Record<string, { window: string; model?: string }> = {
  five_hour: { window: "five_hour" },
  seven_day: { window: "weekly" },
  seven_day_opus: { window: "weekly", model: "claude-opus" },
  seven_day_sonnet: { window: "weekly", model: "claude-sonnet" },
};

function snap(partial: Omit<QuotaSnapshot, "provider" | "fetchedAt" | "origin">, now: Date): QuotaSnapshot {
  return { provider: "claude", fetchedAt: now.toISOString(), origin: "live", ...partial };
}

/** Parser puro (testeado con fixtures de ambas formas). */
export function parseClaudeUsage(data: unknown, now: Date): QuotaSnapshot[] {
  const out: QuotaSnapshot[] = [];
  if (!data || typeof data !== "object") return out;
  const d = data as Record<string, unknown>;

  // Forma 1: buckets planos.
  for (const [key, meta] of Object.entries(FLAT_BUCKETS)) {
    const bucket = d[key] as ClaudeBucket | undefined;
    if (bucket && typeof bucket.utilization === "number") {
      out.push(
        snap({ window: meta.window, model: meta.model, usedPercent: bucket.utilization, resetsAt: bucket.resets_at }, now),
      );
    }
  }

  // Forma 2: limits[] con kind: session|weekly_all|weekly_scoped.
  if (Array.isArray(d.limits)) {
    for (const l of d.limits) {
      if (!l || typeof l !== "object") continue;
      const limit = l as Record<string, unknown>;
      const kind = typeof limit.kind === "string" ? limit.kind : "";
      const utilization = typeof limit.utilization === "number" ? limit.utilization : undefined;
      const resetsAt = typeof limit.resets_at === "string" ? limit.resets_at : undefined;
      if (utilization === undefined) continue;
      if (kind === "session") {
        out.push(snap({ window: "five_hour", usedPercent: utilization, resetsAt }, now));
      } else if (kind === "weekly_all") {
        out.push(snap({ window: "weekly", usedPercent: utilization, resetsAt }, now));
      } else if (kind === "weekly_scoped") {
        const scope = limit.scope as Record<string, unknown> | undefined;
        const model = typeof scope?.model === "string" ? scope.model : undefined;
        out.push(snap({ window: "weekly", model, usedPercent: utilization, resetsAt }, now));
      }
    }
  }
  return out;
}

export async function probeClaude(ctx: ProberContext): Promise<QuotaSnapshot[]> {
  const raw = await readFileRO(ctx.claudeCredentialsPath ?? homePath(".claude", ".credentials.json"));
  const creds = JSON.parse(raw);
  const token = creds?.claudeAiOauth?.accessToken;
  if (typeof token !== "string" || !token) throw new Error("sin accessToken en ~/.claude/.credentials.json");
  if (typeof creds?.claudeAiOauth?.expiresAt === "number" && creds.claudeAiOauth.expiresAt < ctx.now().getTime()) {
    throw new Error("token expirado — abrir Claude Code para renovar");
  }

  const res = await ctx.fetchImpl(USAGE_URL, {
    headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
    signal: AbortSignal.timeout(ctx.timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${USAGE_URL}`);
  return parseClaudeUsage(await res.json(), ctx.now());
}

