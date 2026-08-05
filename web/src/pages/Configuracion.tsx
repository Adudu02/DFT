import { useEffect, useState } from "react";
import { useApi } from "../hooks.js";
import type { Config, WasteThresholds } from "../types.js";
import { Panel } from "../components/Panel.js";
import { Loading } from "../components/Loading.js";
import { Field } from "../components/Field.js";

export function Configuracion() {
  const [key, setKey] = useState(0);
  const { data: cfg } = useApi<Config>("/api/config", key);
  const { data: pricing } = useApi<unknown>("/api/pricing", key);
  const [form, setForm] = useState<Config | null>(null);
  const [pricingText, setPricingText] = useState<string>("");
  const [msg, setMsg] = useState<string>("");
  useEffect(() => {
    if (cfg) setForm(cfg);
  }, [cfg]);
  useEffect(() => {
    if (pricing) setPricingText(JSON.stringify(pricing, null, 2));
  }, [pricing]);
  if (!form) return <Loading />;

  const saveConfig = async () => {
    await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setMsg("configuración guardada");
  };
  const savePricing = async () => {
    try {
      const body = JSON.parse(pricingText);
      const r = await fetch("/api/pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      setMsg(j.ok ? "pricing guardado — corre rebuild para recalcular" : "error: " + j.error);
    } catch (e) {
      setMsg("JSON inválido: " + String(e));
    }
  };
  const rebuild = async () => {
    setMsg("reingiriendo…");
    const r = await fetch("/api/rebuild", { method: "POST" });
    const j = await r.json();
    setMsg(`rebuild: ${j.skillsInserted ?? 0} usos de skills · ${j.eventsInserted} eventos · ${j.memories} memorias`);
    setKey((k) => k + 1);
  };
  const num = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Number(e.target.value) });
  const numW = (k: keyof WasteThresholds) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, waste: { ...form.waste, [k]: Number(e.target.value) } });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Parámetros">
        <Field label="Tarifa por hora (USD)">
          <input type="number" value={form.hourlyRate} onChange={num("hourlyRate")} className="in" />
        </Field>
        <Field label="Umbral obsolescencia (días)">
          <input type="number" value={form.staleDays} onChange={num("staleDays")} className="in" />
        </Field>
        <Field label="Zona horaria (IANA, vacío = la del sistema)">
          <input
            type="text"
            placeholder="America/Merida"
            value={form.timeZone}
            onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
            className="in"
          />
        </Field>
        <Field label="Minutos por uso (default)">
          <input type="number" value={form.minutesPerUseDefault} onChange={num("minutesPerUseDefault")} className="in" />
        </Field>
        <div className="text-term-muted text-xs uppercase tracking-widest mt-3 mb-2">Fugas (Ahorro)</div>
        <Field label="Min. acierto de caché (0–1)">
          <input type="number" step="0.05" value={form.waste.minCacheRatio} onChange={numW("minCacheRatio")} className="in" />
        </Field>
        <Field label="Piso de input para señalar (tokens)">
          <input type="number" value={form.waste.minInputTokens} onChange={numW("minInputTokens")} className="in" />
        </Field>
        <Field label="Turnos para sesión inflada">
          <input type="number" value={form.waste.bloatTurns} onChange={numW("bloatTurns")} className="in" />
        </Field>
        <Field label="Tokens para sesión inflada">
          <input type="number" value={form.waste.bloatTokens} onChange={numW("bloatTokens")} className="in" />
        </Field>
        <Field label="Tarifa input desde la que es «caro»">
          <input type="number" step="0.5" value={form.waste.expensiveInputRate} onChange={numW("expensiveInputRate")} className="in" />
        </Field>
        <Field label="Salida trivial (tokens/turno)">
          <input type="number" value={form.waste.trivialOutputTokens} onChange={numW("trivialOutputTokens")} className="in" />
        </Field>
        <Field label="Min. turnos triviales para señalar">
          <input type="number" value={form.waste.mismatchMinTurns} onChange={numW("mismatchMinTurns")} className="in" />
        </Field>
        <Field label="Modelo destino del downgrade">
          <input
            type="text"
            value={form.waste.downgradeModel}
            onChange={(e) => setForm({ ...form, waste: { ...form.waste, downgradeModel: e.target.value } })}
            className="in"
          />
        </Field>
        <div className="text-term-muted text-xs uppercase tracking-widest mt-3 mb-2">Rutas de agentes</div>
        <Field label="Claude Code (vacío = ~/.claude/projects)">
          <input
            type="text"
            placeholder="~/.claude/projects"
            value={form.agentPaths["claude-code"] ?? ""}
            onChange={(e) => setForm({ ...form, agentPaths: { ...form.agentPaths, "claude-code": e.target.value } })}
            className="in"
          />
        </Field>
        <Field label="Codex (vacío = ~/.codex)">
          <input
            type="text"
            placeholder="~/.codex"
            value={form.agentPaths["codex"] ?? ""}
            onChange={(e) => setForm({ ...form, agentPaths: { ...form.agentPaths, codex: e.target.value } })}
            className="in"
          />
        </Field>
        <div className="text-xs text-term-muted">Tras cambiar rutas, corré Rebuild para reingestar.</div>
        <button onClick={saveConfig} className="btn mt-2">
          Guardar configuración
        </button>
      </Panel>

      <Panel title="pricing.json">
        <textarea
          value={pricingText}
          onChange={(e) => setPricingText(e.target.value)}
          spellCheck={false}
          className="w-full h-64 bg-term-bg border border-term-border rounded p-2 text-xs font-mono text-term-amber"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={savePricing} className="btn">
            Guardar pricing
          </button>
          <button onClick={rebuild} className="btn">
            Rebuild
          </button>
        </div>
      </Panel>

      {msg && <div className="md:col-span-2 text-xs text-term-green">{msg}</div>}
    </div>
  );
}
