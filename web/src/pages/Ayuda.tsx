import { Panel } from "../components/Panel.js";

export function Ayuda() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Conectar tus agentes (local)">
        <p className="text-sm text-term-muted mb-3">
          El dashboard <span className="text-term-green">lee tus transcripts locales en solo lectura</span>.
          No hay que iniciar sesión ni pegar ninguna clave: los costos se calculan
          desde los tokens que ya viven en tu disco.
        </p>
        <ol className="text-sm space-y-2 list-decimal ml-4">
          <li>
            <span className="text-term-amber">Detección automática.</span> Al arrancar
            (<code className="text-term-amber">npm run serve</code>) se ingieren solas:
            <ul className="ml-4 mt-1 text-term-muted list-disc">
              <li>Claude Code → <code>~/.claude/projects/**/*.jsonl</code></li>
              <li>Codex → <code>~/.codex/sessions/**</code> y <code>archived_sessions/</code></li>
              <li>Qwen → <code>~/.qwen/usage/token-usage-*.jsonl</code></li>
            </ul>
          </li>
          <li>
            <span className="text-term-amber">Ruta distinta.</span> Si tus transcripts
            están en otro lado, ponelo en <span className="text-term-amber">Configuración → Rutas de agentes</span>{" "}
            (acepta <code>~/</code>) y corré <span className="text-term-amber">Rebuild</span>.
          </li>
          <li>
            <span className="text-term-amber">Modelo sin tarifa.</span> Un modelo nuevo
            aparece con costo 0 + aviso hasta que agregás su precio en{" "}
            <span className="text-term-amber">Configuración → pricing.json</span>. Nunca se estima en silencio.
          </li>
        </ol>
        <p className="text-xs text-term-muted mt-3">
          CLI equivalente: <code className="text-term-amber">npm run cli</code> (tabla de gasto) ·{" "}
          <code className="text-term-amber">npm run cli -- --waste</code> (fugas de tokens).
        </p>
      </Panel>

      <Panel title="Seguridad y claves API">
        <p className="text-sm text-term-muted mb-3">
          Programa <span className="text-term-green">local y de solo lectura</span>. Aun así,
          estas son las garantías concretas:
        </p>
        <ul className="text-sm space-y-2">
          <li>
            <span className="text-term-green">✓ Nunca pide ni almacena claves.</span> No necesita
            API keys: calcula el costo <em>equivalente API</em> desde conteos de tokens locales.
            Si algo te pide una clave, no es este programa.
          </li>
          <li>
            <span className="text-term-green">✓ Fuentes intactas.</span> Todo se abre con flag{" "}
            <code>'r'</code> (<code>fs-readonly.ts</code>): jamás crea, escribe ni trunca. Un test de
            integridad hashea el árbol de fuentes antes/después de ingerir y exige que no cambie.
          </li>
          <li>
            <span className="text-term-green">✓ Solo lee transcripts.</span> La búsqueda es una
            lista blanca (<code>rollout-*.jsonl</code>, <code>token-usage-*.jsonl</code>, <code>*.jsonl</code>, memoria <code>*.md</code>).
            Nunca abre <code>~/.codex/auth.json</code>, <code>~/.qwen/settings.json</code>, <code>.env</code> ni archivos de credenciales.
          </li>
          <li>
            <span className="text-term-green">✓ Guarda solo métricas.</span> En <code>./data/motor.db</code>
            van conteos de tokens, modelo y nombres de skills — <b>nunca</b> el texto de tus
            prompts. El drill-down de Actividad sí los muestra: los lee del transcript original
            (solo lectura) al consultar y no los persiste.
          </li>
          <li>
            <span className="text-term-green">✓ Sin exposición de red.</span> El servidor bindea solo a{" "}
            <code>127.0.0.1:8081</code>. No lo pongas detrás de un proxy público ni lo expongas a la LAN;
            no tiene auth porque no está pensado para eso.
          </li>
        </ul>
        <p className="text-xs text-term-muted mt-3">
          Precios en <code>pricing.json</code> son list-price de terceros (ago-2026); reverificá contra
          las páginas oficiales cuando importe para dinero real.
        </p>
      </Panel>
    </div>
  );
}
