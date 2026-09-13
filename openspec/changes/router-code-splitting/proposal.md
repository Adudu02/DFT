# Proposal: router-code-splitting

## Why

La navegación es `useState(0)`: no hay router, el estado se pierde al recargar, no hay back/forward del navegador ni deep links a páginas (ítem ⑤ de `MEJORAS.md`). Además el build genera **un solo chunk de 569 KB** (aviso de Vite > 500 KB) que carga las 7 páginas aunque solo se vea una — Recharts viaja siempre (ítem ⑥).

## What Changes

- **Router**: `react-router-dom` v7 con `BrowserRouter`. Cada tab pasa a ruta estable: `/`, `/ahorro`, `/skills`, `/memoria`, `/actividad`, `/configuracion`, `/ayuda`. La nav usa `NavLink` (mismo estilo activo/inactivo); rutas desconocidas redirigen a `/`.
- **SPA fallback en el server**: `@fastify/static` + handler `notFound` que sirve `index.html` para rutas no-API — así recargar o abrir un deep link funciona. Las rutas `/api/*` desconocidas siguen respondiendo 404 JSON.
- **Code-splitting**: las 7 páginas pasan a `React.lazy` + `Suspense` (fallback: `Loading` existente) — Vite parte el bundle en chunks por página; Recharts solo viaja a las páginas con gráficos.
- `ErrorBoundary` se sigue usando con `key` = ruta actual (equivalente al `key={tab}` actual).

## Capabilities

### New Capabilities

- `page-navigation`: navegación por URL de la app — rutas estables por página, deep links con recarga (SPA fallback) y redirección de rutas desconocidas.

### Modified Capabilities

<!-- Ninguna. -->

## Impact

- **Web**: `web/src/App.tsx` (router + lazy), `web/src/main.tsx` (BrowserRouter). Sin cambios en páginas: son componentes sin props.
- **Server**: `src/server.ts` — opción `distRoot` inyectable (para tests herméticos) + fallback SPA. Los contratos `/api/*` existentes no cambian.
- **Dependencias**: `react-router-dom` ^7 (empaquetada por Vite; misma política que react/recharts).
- **Perf**: el chunk inicial baja del aviso de 569 KB; cada página carga su propio chunk bajo demanda.
- **Riesgo**: medio-bajo — la migración es contenida (nav + rutas); el refresco global (`useApi`/tick) es externo al App y no se toca.
