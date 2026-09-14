/**
 * Prober Copilot (Fase 2, fixture-driven): GET
 * `api.github.com/copilot_internal/user` con el `oauth_token` de
 * `~/.config/github-copilot/apps.json` (OAuth flow de Copilot; un PAT suelto
 * NO sirve). Respuesta: `quota_snapshots.{chat,completions,premium_interactions}
 * .{percent_remaining, remaining, entitlement, unlimited}` + `quota_reset_date`
 * + `copilot_plan`. OJO: percent_remaining es RESTANTE → se invierte a usado.
 * Entradas `unlimited: true` se omiten (barra sin sentido).
 */
import { readFileRO } from "../../lib/fs-readonly.js";
import { homePath } from "../../lib/paths.js";
import type { ProberContext, QuotaSnapshot } from "../types.js";

const USER_URL = "https://api.github.com/copilot_internal/user";

const SNAPSHOTS: Record<string, string> = {
  chat: "chat",
  completions: "completions",
  premium_interactions: "premium_interactions",
};

/** Parser puro (fixture-driven). */
export function parseCopilotUser(data: unknown, now: Date): QuotaSnapshot[] {
  const out: QuotaSnapshot[] = [];
  const d = data as Record<string, any>;
  const snapshots = d?.quota_snapshots;
  const plan = typeof d?.copilot_plan === "string" ? d.copilot_plan : undefined;
  const resetsAt = typeof d?.quota_reset_date === "string" ? d.quota_reset_date : undefined;
  if (!snapshots || typeof snapshots !== "object") return out;
  for (const [key, label] of Object.entries(SNAPSHOTS)) {
    const s = snapshots[key];
    if (!s || typeof s !== "object") continue;
    if (s.unlimited === true) continue;
    if (typeof s.percent_remaining !== "number") continue;
    out.push({
      provider: "copilot",
      model: label,
      window: "monthly",
      usedPercent: Math.max(0, Math.round(100 - s.percent_remaining)),
      remaining: typeof s.remaining === "number" ? s.remaining : undefined,
      resetsAt,
      plan,
      fetchedAt: now.toISOString(),
      origin: "live",
    });
  }
  return out;
}

export async function probeCopilot(ctx: ProberContext): Promise<QuotaSnapshot[]> {
  let token: string | undefined;
  try {
    const raw = await readFileRO(ctx.copilotAppsPath ?? homePath(".config", "github-copilot", "apps.json"));
    const apps = JSON.parse(raw);
    token = apps?.["github.com"]?.oauth_token ?? apps?.oauth_token;
  } catch {
    // sin apps.json => no-credential abajo
  }
  if (!token) throw new Error("no-credential: sin oauth_token en ~/.config/github-copilot/apps.json");

  const res = await ctx.fetchImpl(USER_URL, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(ctx.timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${USER_URL}`);
  const snaps = parseCopilotUser(await res.json(), ctx.now());
  if (!snaps.length) throw new Error("respuesta sin quota_snapshots reconocidos");
  return snaps;
}
