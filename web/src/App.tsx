import { useMemo, useState } from "react";
import { RefreshControl } from "./components/RefreshControl.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Inicio } from "./pages/Inicio.js";
import { Ahorro } from "./pages/Ahorro.js";
import { Skills } from "./pages/Skills.js";
import { Memoria } from "./pages/Memoria.js";
import { Actividad } from "./pages/Actividad.js";
import { Configuracion } from "./pages/Configuracion.js";
import { Ayuda } from "./pages/Ayuda.js";

const TABS = [
  ["Inicio", Inicio],
  ["Ahorro", Ahorro],
  ["Skills", Skills],
  ["Memoria", Memoria],
  ["Actividad", Actividad],
  ["Configuración", Configuracion],
  ["Ayuda", Ayuda],
] as const;

export default function App() {
  const [tab, setTab] = useState(0);
  const Active = useMemo(() => TABS[tab][1], [tab]);
  return (
    <div className="min-h-screen">
      <header className="border-b border-term-border px-4 sm:px-8 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 sticky top-0 bg-term-bg/95 backdrop-blur z-10">
        <span className="brand text-2xl sm:text-3xl text-term-text whitespace-nowrap mr-auto">How much you messed up?</span>
        <nav className="order-3 w-full overflow-x-auto flex gap-5 text-sm sm:order-none sm:w-auto">
          {TABS.map(([name], i) => (
            <button
              key={name}
              onClick={() => setTab(i)}
              className={`num font-bold whitespace-nowrap transition-colors ${
                i === tab ? "text-term-amber" : "text-term-muted hover:text-term-amber"
              }`}
            >
              {name}
            </button>
          ))}
        </nav>
        <RefreshControl />
      </header>
      <main className="p-4 sm:p-8 max-w-[1360px] mx-auto overflow-x-hidden">
        <ErrorBoundary key={tab}>
          <Active />
        </ErrorBoundary>
      </main>
    </div>
  );
}
