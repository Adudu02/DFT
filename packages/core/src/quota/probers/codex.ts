/**
 * Prober Codex (Fase 1): live `GET chatgpt.com/backend-api/wham/usage` con el
 * token de `~/.codex/auth.json` (+ header chatgpt-account-id), y fallback
 * offline: `rate_limits` del último evento `token_count` en los rollouts ya
 * descubiertos (origin offline-stale, gratis y sin credencial). Endpoint no
 * documentado — parser protegido por fixtures.
 */
import { readFileRO } from "../../lib/fs-readonly.js";
import { homePath } from "../../lib/paths.js";
import { discoverCodexSessions } from "../../adapters/codex.js";
import type { ProberContext, QuotaSnapshot } from "../types.js";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

/**
 * 300 → five_hour, 10080 → weekly. Unidades DUALES confirmadas por E2E real:
 * el endpoint live usa SEGUNDOS (604800 = weekly, 18000 = 5h) y los artefactos
 * locales (registry/rollouts) usan MINUTOS (10080 = weekly, 300 = 5h).
 * El valor 300/10080 coincide semánticamente en ambas unidades.
 */
export function mapCodexWindow(value: number): string {
  if (value === 300 || value === 18000) return "five_hour";
  if (value === 10080 || value === 604800) return "weekly";
  return `window-${value}`;
}

function snap(partial: Omit<QuotaSnapshot, "provider" | "fetchedAt" | "origin">, now: Date): QuotaSnapshot {
  return { provider: "codex", fetchedAt: now.toISOString(), origin: "live", ...partial };
}

interface CodexWindow {
  used_percent?: number;
  limit_window_seconds?: number;
  limit_window_minutes?: number;
  reset_at?: string;
  reset_after_seconds?: number;
}

/** Parser puro del payload live (testeado con fixture). */
export function parseCodexUsage(data: unknown, now: Date): QuotaSnapshot[] {
  const out: QuotaSnapshot[] = [];
  const d = data as Record<string, any>;
  const rl = d?.rate_limit;
  if (!rl || typeof rl !== "object") return out;
  const plan = typeof d.plan_type === "string" ? d.plan_type : undefined;
  for (const [key, win] of Object.entries({ primary_window: rl.primary_window, secondary_window: rl.secondary_window }) as [string, CodexWindow | null][]) {
    if (!win || typeof win.used_percent !== "number") continue;
    const duration = win.limit_window_minutes ?? win.limit_window_seconds;
    const window = typeof duration === "number" ? mapCodexWindow(duration) : key === "primary_window" ? "five_hour" : "weekly";
    let resetsAt = typeof win.reset_at === "string" ? win.reset_at : undefined;
    if (!resetsAt && typeof win.reset_after_seconds === "number") {
      resetsAt = new Date(now.getTime() + win.reset_after_seconds * 1000).toISOString();
    }
    out.push(snap({ window, usedPercent: win.used_percent, resetsAt, plan }, now));
  }
  return out;
}

/** Fallback offline: rate_limits del último token_count en los rollouts (RO). */
export async function codexOfflineSnapshots(ctx: ProberContext): Promise<QuotaSnapshot[]> {
  const root = ctx.codexRoot;
  if (!root) return [];
  let paths: string[];
  try {
    paths = await discoverCodexSessions(root);
  } catch {
    return [];
  }
  // Los más recientes primero (los paths ordenan por fecha en la ruta).
  for (const path of [...paths].reverse()) {
    try {
      const lines = (await readFileRO(path)).split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        let o: any;
        try {
          o = JSON.parse(line);
        } catch {
          continue;
        }
        const rl = o?.payload?.info?.rate_limits;
        if (!rl?.primary && !rl?.secondary) continue;
        const now = ctx.now();
        const out: QuotaSnapshot[] = [];
        for (const [key, w] of Object.entries({ primary: rl.primary, secondary: rl.secondary }) as [string, any][]) {
          if (!w || typeof w.used_percent !== "number") continue;
          const minutes = typeof w.window_minutes === "number" ? w.window_minutes : undefined;
          out.push({
            provider: "codex",
            window: minutes ? mapCodexWindow(minutes) : key === "primary" ? "five_hour" : "weekly",
            usedPercent: w.used_percent,
            resetsAt: typeof w.resets_at === "string" ? w.resets_at : undefined,
            plan: typeof rl.plan_type === "string" ? rl.plan_type : undefined,
            fetchedAt: now.toISOString(),
            origin: "offline-stale",
          });
        }
        if (out.length) return out; // el snapshot más reciente gana
      }
    } catch {
      continue; // rollout ilegible: siguiente
    }
  }
  return [];
}

export async function probeCodex(ctx: ProberContext): Promise<QuotaSnapshot[]> {
  // Live primero; si falla, offline-stale (el llamador distingue el origen).
  let token: string | undefined;
  let accountId: string | undefined;
  try {
    const raw = await readFileRO(ctx.codexAuthPath ?? homePath(".codex", "auth.json"));
    const auth = JSON.parse(raw);
    token = auth?.tokens?.access_token;
    accountId = auth?.tokens?.account_id ?? auth?.tokens?.chatgpt_account_id;
  } catch {
    // sin auth.json => directo al fallback offline
  }
  if (token) {
    try {
      const res = await ctx.fetchImpl(USAGE_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(accountId ? { "chatgpt-account-id": accountId } : {}),
        },
        signal: AbortSignal.timeout(ctx.timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${USAGE_URL}`);
      return parseCodexUsage(await res.json(), ctx.now());
    } catch {
      // live falló => cae al offline abajo (con causa visible vía origin)
    }
  }
  const offline = await codexOfflineSnapshots(ctx);
  if (offline.length) return offline;
  throw new Error(token ? `HTTP error en ${USAGE_URL} y sin rollouts offline` : "sin credencial de Codex ni rollouts offline");
}

