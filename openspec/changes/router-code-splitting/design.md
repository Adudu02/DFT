# Design: router-code-splitting

## Context

`App.tsx` mantiene `useState(0)` + `TABS` y renderiza `<TABS[tab][1] />`. El refresco global (`RefreshControl` → `refreshAll()` → tick externo consumido por `useApi` con `useSyncExternalStore`) vive fuera del estado de tabs, así que la migración al router no lo afecta. El server registra `@fastify/static` solo si existe `web/dist`; sin fallback, una recarga en `/ahorro` daría 404. Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- URLs estables con back/forward, deep links y recarga operativa.
- Bundle inicial por debajo del umbral de aviso (500 KB), chunks por página.
- Fallback SPA que no enmarezca los 404 JSON de `/api/*`.

**Non-Goals:**

- No se migran las páginas: son componentes sin props y siguen idénticas.
- No hay lazy-loading con datos prefetch ni suspensión de datos — solo el chunk de código.
- No se añade una página 404 dedicada: ruta desconocida → redirección a `/`.
- No se toca `RefreshControl`, `useApi` ni el tick global.

## Decisions

1. **`react-router-dom` v7 + `BrowserRouter`.** URLs limpias (`/ahorro`, no `#/ahorro`); requiere el fallback SPA que este change agrega al server. Alternativa descartada: `HashRouter` — evita tocar el server pero deja URLs menos legibles y rompe el objetivo de "URLs estables" de `MEJORAS.md`.
2. **Tabla de rutas como única fuente de verdad.** Un array `PAGES = [{ path, label, Component }]` alimenta `Routes` y la nav — nada de duplicar la lista. Los componentes se importan con `lazy(() => import(...))`; Vite divide chunks automáticamente por punto de importación dinámico.
3. **Fallback SPA con guard de API.** `app.setNotFoundHandler`: si la URL empieza con `/api` → 404 JSON (igual que hoy); si no → `reply.sendFile("index.html")`. Se registra solo cuando el dist existe. `server.ts` gana `ServerOptions.distRoot` inyectable para testear el fallback sin depender del artefacto del build (en CI los tests corren antes del build).
4. **Suspense con el `Loading` existente** y `ErrorBoundary` con `key={pathname}` — mismo comportamiento de "arranque limpio por página" que hoy con `key={tab}`, ahora derivado de la ruta.
5. **Redirect con `<Navigate to="/" replace />`** en la ruta catch-all `*`: cualquier URL desconocida aterriza en inicio sin dejar entrada muerta en el historial.

## Risks / Trade-offs

- [El fallback SPA enmascara 404 de rutas mal escritas del frontend] → Solo aplica fuera de `/api`; el producto es un dashboard con 7 rutas cerradas, el redirect al inicio es el comportamiento deseado.
- [`react-router-dom` añade peso al chunk inicial] ~20 KB gzip — se compensa con la separación de páginas (Recharts pesa mucho más que el router).
- [Los tests del server ahora dependen de `distRoot` sintético] → Lo hace hermético, no frágil: el test monta un tmp con un `index.html` falso.

## Migration Plan

Sin migración de datos. La URL `/` sigue mostrando Inicio — comportamiento idéntico para quien tenga el dashboard abierto. Rollback = revertir el PR.

## Open Questions

Ninguna que bloquee implementación.
