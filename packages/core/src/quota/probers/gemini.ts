/**
 * Prober Gemini (Fase 2, fixture-driven): POST
 * `cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota` con el OAuth de
 * `~/.gemini/oauth_creds.json` + `project` en el body (requiere projectId).
 * Respuesta: `buckets[] {modelId, remainingAmount, remainingFraction,
 * resetTime}` — UN snapshot por modelId (nunca agregado);
 * `usedPercent = (1 − remainingFraction)·100`, `limit ≈ amount/fraction`.
 */
import { readFileRO } from "../../lib/fs-readonly.js";
import { homePath } from "../../lib/paths.js";
import type { ProberContext, QuotaSnapshot } from "../types.js";

const QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";

/** Parser puro (fixture-driven). */
export function parseGeminiQuota(data: unknown, now: Date): QuotaSnapshot[] {
  const out: QuotaSnapshot[] = [];
  const buckets = (data as Record<string, any>)?.buckets;
  if (!Array.isArray(buckets)) return out;
  for (const b of buckets) {
    if (!b || typeof b !== "object" || typeof b.modelId !== "string") continue;
    const fraction = typeof b.remainingFraction === "number" ? b.remainingFraction : undefined;
    if (fraction === undefined || fraction <= 0 || fraction > 1) continue; // sin fracción no hay barra honesta
    const amount = typeof b.remainingAmount === "number" ? b.remainingAmount : undefined;
    const limit = amount !== undefined && fraction > 0 ? Math.round(amount / fraction) : undefined;
    out.push({
      provider: "gemini",
      model: b.modelId,
      window: "model",
      usedPercent: Math.round((1 - fraction) * 100),
      limit,
      remaining: amount,
      resetsAt: typeof b.resetTime === "string" ? b.resetTime : undefined,
      fetchedAt: now.toISOString(),
      origin: "live",
    });
  }
  return out;
}

export async function probeGemini(ctx: ProberContext): Promise<QuotaSnapshot[]> {
  const projectId = ctx.geminiProjectId ?? process.env.GEMINI_PROJECT_ID;
  if (!projectId) {
    throw new Error("no-credential: falta projectId (config quota.providers.geminiProjectId o env GEMINI_PROJECT_ID)");
  }
  let accessToken: string | undefined;
  try {
    const raw = await readFileRO(ctx.geminiCredentialsPath ?? homePath(".gemini", "oauth_creds.json"));
    accessToken = JSON.parse(raw)?.access_token;
  } catch {
    // sin creds => no-credential abajo
  }
  if (!accessToken) throw new Error("no-credential: sin access_token en ~/.gemini/oauth_creds.json");

  const res = await ctx.fetchImpl(QUOTA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ project: projectId }),
    signal: AbortSignal.timeout(ctx.timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${QUOTA_URL}`);
  const snaps = parseGeminiQuota(await res.json(), ctx.now());
  if (!snaps.length) throw new Error("respuesta sin buckets reconocidos");
  return snaps;
}
