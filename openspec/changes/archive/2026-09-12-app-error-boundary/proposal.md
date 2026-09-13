# Proposal: app-error-boundary

## Why

Hoy, si cualquier página lanza durante el render (un `undefined` inesperado en datos de la API, un campo faltante tras un cambio de esquema), la excepción sube hasta la raíz y **toda la app se cae en pantalla blanca** sin mensaje ni recuperación — el usuario tiene que recargar a ciegas (ítem ⑪ de `MEJORAS.md`). Un error boundary acota el daño a la página afectada y ofrece reintentar sin perder la navegación.

## What Changes

- Nuevo componente `ErrorBoundary` (clase React con `getDerivedStateFromError`/`componentDidCatch`) en `web/src/components/ErrorBoundary.tsx`.
- `App.tsx` envuelve `<Active />` con el boundary, con `key={tab}` para que cambiar de pestaña arranque limpio.
- El estado de error muestra un panel acorde al tema Nocturne con el mensaje de la excepción y un botón «Reintentar» que remonta la página.

## Capabilities

### New Capabilities

- `ui-render-resilience`: recuperación ante errores de render en la UI — una excepción en una página no derriba la app; muestra un panel de error con reintento y el header/nav siguen operativos.

### Modified Capabilities

<!-- Ninguna. -->

## Impact

- **Código**: `web/src/components/ErrorBoundary.tsx` (nuevo), `web/src/App.tsx` (envolver `<Active />`).
- **Dependencias**: ninguna — componente de clase propio en vez de `react-error-boundary` (una dependencia nueva no se justifica para un boundary de ~40 líneas).
- **Comportamiento**: los errores de render dejan de blank-scan la app; los errores en fetch ya se manejaban por página (`ErrorMsg`) y no cambian.
- **Riesgo**: bajo — el boundary solo actúa si hay excepción; el flujo normal no se altera.
