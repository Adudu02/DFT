import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RefreshControl } from "./components/RefreshControl.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Loading } from "./components/Loading.js";
import { Icon, type IconName } from "./components/Icon.js";

// Lazy por página: Vite parte el bundle en chunks (Recharts solo viaja a las
// páginas con gráficos). Las páginas usan named exports → se adaptan a default.
const PAGES: { path: string; label: string; icon: IconName; Component: React.LazyExoticComponent<() => React.JSX.Element> }[] = [
  { path: "/", label: "Inicio", icon: "home", Component: lazy(() => import("./pages/Inicio.js").then((m) => ({ default: m.Inicio }))) },
  { path: "/actividad", label: "Actividad", icon: "activity", Component: lazy(() => import("./pages/Actividad.js").then((m) => ({ default: m.Actividad }))) },
  { path: "/ahorro", label: "Ahorro", icon: "savings", Component: lazy(() => import("./pages/Ahorro.js").then((m) => ({ default: m.Ahorro }))) },
  { path: "/skills", label: "Skills", icon: "skills", Component: lazy(() => import("./pages/Skills.js").then((m) => ({ default: m.Skills }))) },
  { path: "/memoria", label: "Memoria", icon: "memory", Component: lazy(() => import("./pages/Memoria.js").then((m) => ({ default: m.Memoria }))) },
  { path: "/configuracion", label: "Configuración", icon: "settings", Component: lazy(() => import("./pages/Configuracion.js").then((m) => ({ default: m.Configuracion }))) },
  { path: "/ayuda", label: "Ayuda", icon: "help", Component: lazy(() => import("./pages/Ayuda.js").then((m) => ({ default: m.Ayuda }))) },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-term-amber to-[#3b5bdb] flex items-center justify-center flex-none shadow-sm">
        <span className="brand text-white text-sm">$</span>
      </div>
      <div className="min-w-0 leading-tight">
        <div className="brand text-[15px] text-term-text truncate">How much did u waste?</div>
        <div className="text-[11px] text-term-muted truncate">Costos &amp; actividad</div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate, className = "" }: { onNavigate?: () => void; className?: string }) {
  return (
    <nav className={className}>
      {PAGES.map(({ path, label, icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              isActive ? "bg-term-amber/10 text-term-amber" : "text-term-muted hover:bg-black/[0.03] hover:text-term-text"
            }`
          }
        >
          <Icon name={icon} className="w-[18px] h-[18px] flex-none" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  const location = useLocation();
  const current = PAGES.find((p) => (p.path === "/" ? location.pathname === "/" : location.pathname.startsWith(p.path))) ?? PAGES[0];

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:w-[232px] md:flex-none md:flex-col md:gap-6 md:border-r md:border-term-border md:bg-term-panel md:px-4 md:py-5 md:sticky md:top-0 md:h-screen">
        <Brand />
        <NavItems className="flex flex-col gap-1" />
        <div className="mt-auto border-t border-term-border pt-4">
          <RefreshControl />
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="md:hidden sticky top-0 z-10 bg-term-panel/95 backdrop-blur border-b border-term-border px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Brand />
          <RefreshControl />
        </div>
        <NavItems className="flex gap-1 overflow-x-auto -mx-1 px-1" />
      </header>

      <div className="flex-1 min-w-0">
        <main className="p-4 sm:p-8 max-w-[1360px] mx-auto overflow-x-hidden">
          <h1 className="text-2xl font-bold text-term-text mb-5">{current.label}</h1>
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<Loading />}>
              <Routes>
                {PAGES.map(({ path, Component }) => (
                  <Route key={path} path={path} element={<Component />} />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
