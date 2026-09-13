# Tasks: app-error-boundary

## 1. Componente ErrorBoundary

- [x] 1.1 Crear `web/src/components/ErrorBoundary.tsx`: clase React con `getDerivedStateFromError`, `componentDidCatch` (log a consola con el stack), estado `attempt` para remontaje vía `<Fragment key>`, y panel de error con `role="alert"`, mensaje de la excepción y botón «Reintentar». Verificar: el archivo compila y expone el componente.

- [x] 1.2 En `web/src/App.tsx`, envolver `<Active />` con `<ErrorBoundary key={tab}>`. Verificar: grep muestra el wrapper en `App.tsx`.

## 2. Verificación integral

- [x] 2.1 Ejecutar `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` y confirmar que todo pasa. Verificar: salida limpia en los cuatro comandos.
