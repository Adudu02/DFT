import { useMemo, useState } from "react";
import { INLINE_STYLES } from "./constants.js";
import { RefreshControl } from "./components/RefreshControl.js";
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
      <style>{INLINE_STYLES}</style>
      <header className="border-b border-term-border px-3 py-3 flex flex-wrap items-center gap-2 sticky top-0 bg-term-bg z-10">
        <span className="text-term-amber font-bold whitespace-nowrap">▎motor agéntico</span>
        <nav className="order-3 w-full overflow-x-auto flex gap-1 text-sm sm:order-none sm:w-auto">
          {TABS.map(([name], i) => (
            <button
              key={name}
              onClick={() => setTab(i)}
              className={`px-3 py-1 rounded ${i === tab ? "bg-term-amber text-black" : "text-term-muted hover:text-term-amber"}`}
            >
              {name}
            </button>
          ))}
        </nav>
        <RefreshControl />
      </header>
      <main className="p-3 sm:p-4 max-w-6xl mx-auto overflow-x-hidden">
        <Active />
      </main>
    </div>
  );
}
