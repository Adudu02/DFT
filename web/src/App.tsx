import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RefreshControl } from "./components/RefreshControl.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Loading } from "./components/Loading.js";

// Lazy por página: Vite parte el bundle en chunks (Recharts solo viaja a las
// páginas con gráficos). Las páginas usan named exports → se adaptan a default.
const PAGES = [
  { path: "/", label: "Inicio", Component: lazy(() => import("./pages/Inicio.js").then((m) => ({ default: m.Inicio }))) },
  { path: "/ahorro", label: "Ahorro", Component: lazy(() => import("./pages/Ahorro.js").then((m) => ({ default: m.Ahorro }))) },
  { path: "/skills", label: "Skills", Component: lazy(() => import("./pages/Skills.js").then((m) => ({ default: m.Skills }))) },
  { path: "/memoria", label: "Memoria", Component: lazy(() => import("./pages/Memoria.js").then((m) => ({ default: m.Memoria }))) },
  { path: "/actividad", label: "Actividad", Component: lazy(() => import("./pages/Actividad.js").then((m) => ({ default: m.Actividad }))) },
  { path: "/configuracion", label: "Configuración", Component: lazy(() => import("./pages/Configuracion.js").then((m) => ({ default: m.Configuracion }))) },
  { path: "/ayuda", label: "Ayuda", Component: lazy(() => import("./pages/Ayuda.js").then((m) => ({ default: m.Ayuda }))) },
];

export default function App() {
  const location = useLocation();
  return (
    <div className="min-h-screen">
      <header className="border-b border-term-border px-4 sm:px-8 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 sticky top-0 bg-term-bg/95 backdrop-blur z-10">
        <span className="brand text-2xl sm:text-3xl text-term-text whitespace-nowrap mr-auto">How much you messed up?</span>
        <nav className="order-3 w-full overflow-x-auto flex gap-5 text-sm sm:order-none sm:w-auto">
          {PAGES.map(({ path, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                `num font-bold whitespace-nowrap transition-colors ${
                  isActive ? "text-term-amber" : "text-term-muted hover:text-term-amber"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <RefreshControl />
      </header>
      <main className="p-4 sm:p-8 max-w-[1360px] mx-auto overflow-x-hidden">
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
  );
}
