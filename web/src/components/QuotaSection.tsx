import { useApi } from "../hooks.js";
import { Panel } from "../components/Panel.js";

/**
 * Sección "Cuota" (add-quota-probes): una barra por proveedor/modelo/ventana.
 * SIN agregación entre modelos ni ventanas. Umbrales: warn ≥70%, crítico ≥90%.
 * Estados: live | stale (con edad) | error | no-credential (instrucción).
 */
interface QuotaSnapshot {
  provider: string;
  model?: string;
  window: string;
  usedPercent?: number;
  resetsAt?: string;
  origin?: string;
}

interface QuotaResponse {
  status: string;
  ageMinutes: number | null;
  ttlMinutes: number;
  snapshots: QuotaSnapshot[];
}

const PROVIDER_LABEL: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  zai: "Z.ai GLM",
  gemini: "Gemini",
  copilot: "Copilot",
  openrouter: "OpenRouter",
};

function barColor(pct: number): string {
  if (pct >= 90) return "bg-term-red";
  if (pct >= 70) return "bg-term-amber";
  return "bg-term-green";
}

function QuotaBar({ s }: { s: QuotaSnapshot }) {
  if (s.usedPercent === undefined) return null;
  const pct = Math.round(s.usedPercent);
  const scope = [PROVIDER_LABEL[s.provider] ?? s.provider, s.model, s.window].filter(Boolean).join(" · ");
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-term-text">
          {scope}
          {s.origin === "offline-stale" && <span className="text-term-muted"> · offline</span>}
        </span>
        <span className="num text-term-muted">{pct}%</span>
      </div>
      <div className="h-2 bg-term-bg border border-term-border rounded-full overflow-hidden">
        <div className={`h-full ${barColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {s.resetsAt && <div className="text-term-muted text-[10px] mt-0.5">reset {s.resetsAt.replace("T", " ").slice(0, 16)}</div>}
    </div>
  );
}

export function QuotaSection() {
  const { data, error } = useApi<QuotaResponse>("/api/quota");
  if (error || !data || data.snapshots.length === 0) return null; // sin dato: la sección no molesta

  return (
    <Panel className="md:col-span-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-term-muted text-xs uppercase tracking-widest">Cuota restante</span>
        <span className="text-term-muted text-[10px]">
          {data.status === "live" ? "en vivo" : data.status === "stale" ? `stale · hace ${data.ageMinutes ?? "?"} min` : data.status}
        </span>
      </div>
      {data.snapshots.map((s, i) => (
        <QuotaBar key={`${s.provider}-${s.model ?? ""}-${s.window}-${i}`} s={s} />
      ))}
      <div className="text-term-muted text-[10px] mt-1">
        Refrescá con <code>pnpm quota -- --refresh</code> · TTL {data.ttlMinutes} min
      </div>
    </Panel>
  );
}
