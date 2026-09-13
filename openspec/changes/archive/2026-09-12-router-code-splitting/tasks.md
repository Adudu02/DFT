# Tasks: router-code-splitting

## 1. Router y code-splitting (web)

- [x] 1.1 Agregar `react-router-dom` ^7 como devDependency del workspace raíz. Verificar: `pnpm install` pasa y aparece en `package.json`.

- [x] 1.2 Migrar `web/src/App.tsx` a `BrowserRouter` (en `main.tsx`): tabla `PAGES` única (path, label, Component lazy), `Routes` + `NavLink` con el estilo activo actual, catch-all `<Navigate to="/" replace />`, `Suspense` con `Loading` y `ErrorBoundary key={pathname}`. Verificar: `pnpm typecheck` pasa.

- [x] 1.3 Build y medir: `pnpm run build` genera múltiples chunks (uno por página) y el chunk inicial queda por debajo del umbral de aviso (500 KB). Verificar: salida del build sin el aviso de chunk > 500 KB.

## 2. Fallback SPA en el server

- [x] 2.1 En `src/server.ts`: opción `distRoot` inyectable en `ServerOptions`; registrar `app.setNotFoundHandler` cuando exista el dist — `/api/*` → 404 JSON, resto → `reply.sendFile("index.html")`. Verificar: `pnpm typecheck` pasa.

- [x] 2.2 Tests en `test/server.test.ts` con `distRoot` tmp (index.html falso): GET a una ruta de página devuelve el HTML; GET `/api/inexistente` devuelve 404 JSON. Verificar: `pnpm vitest run test/server.test.ts` pasa.

## 3. Verificación integral

- [x] 3.1 Ejecutar `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` — todo en verde. Verificar: salida limpia en los cuatro comandos y build con chunks separados.
