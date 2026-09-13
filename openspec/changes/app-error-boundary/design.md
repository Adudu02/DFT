# Design: app-error-boundary

## Context

`App.tsx` renderiza `<Active />` dentro de `<main>` sin ningún boundary: una excepción en el render de cualquier página desmonta el árbol completo (pantalla en blanco). Los errores de *fetch* ya se manejan por página con `ErrorMsg`, pero un throw de render (datos con forma inesperada) no tiene red. Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- Un throw en una página deja header/nav operativos y muestra un panel de error con reintento.
- «Reintentar» remonta la página de verdad (re-ejecuta sus `useApi`/fetchs), no solo limpia el mensaje.
- Accesible: `role="alert"` y mensaje en texto.

**Non-Goals:**

- No se capturan errores de event handlers ni de operaciones async (React los boundary no los atrapan; los fetch ya tienen su manejo).
- No se añade reporte remoto de errores (app local, sin telemetría).
- No se envuelve la app entera — solo el área de contenido de página.

## Decisions

1. **Componente de clase propio, sin dependencia nueva.** React sigue exigiendo clases para `getDerivedStateFromError`/`componentDidCatch`; `react-error-boundary` aporta ergonomía que aquí no se necesita (~40 líneas). Alternativa descartada: añadir la dependencia.
2. **Remontaje real en el reintento.** El boundary guarda `attempt` en estado y usa `<Fragment key={attempt}>` para envolver a los hijos: «Reintentar» incrementa `attempt`, fuerza remount y re-ejecuta las cargas de la página. Limpiar solo `error` re-renderizaría el mismo árbol posiblemente fallando de nuevo de forma determinista.
3. **`key={tab}` en el boundary (App.tsx).** Al cambiar de pestaña se instancia un boundary nuevo — estado limpio garantizado sin lógica extra, y coincide con la semántica «el error es de esa página».
4. **UI del panel coherente con el tema.** Caja estilo Panel (fondo `term-panel`, borde `term-border`), mensaje con `text-term-red`, botón con la clase `btn` existente y `role="alert"`.

## Risks / Trade-offs

- [El boundary oculta bugs de render en desarrollo] → `componentDidCatch` imprime el stack en consola; el panel muestra el mensaje completo.
- [Errores en event handlers siguen cayendo fuera del boundary] → Es una limitación de React; los handlers actuales son simples (`setTab`, `onChange`), y los fetch ya tienen try/catch o `useApi`.

## Migration Plan

Sin migración. Rollback = revertir el commit (dos archivos).

## Open Questions

Ninguna que bloquee implementación.
