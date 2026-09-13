# Proposal: web-a11y-foundations

## Why

Los ítems de accesibilidad de `MEJORAS.md` (⑦–⑩): la página no tiene ningún encabezado semántico (ni `h1` — el brand es un `span`, los títulos de panel son `div.kicker`), los botones de solo-icono carecen de nombre accesible (el `↻` del refresh), el toggle AUTO no expone su estado, y el foco de teclado depende del outline por defecto que el tema puede degradar. Nota de alcance: el ⑦ original (patrón ARIA tabs) quedó **satisfecho por la migración al router** — la navegación hoy es un `<nav>` de enlaces reales y `NavLink` emite `aria-current="page"`; forzar `role="tablist"` sobre navegación de rutas degradaría la semántica correcta.

## What Changes

- **Jerarquía de encabezados (⑧)**: brand → `<h1>`, título de `Panel` → `<h2>`, etiquetas de grupo en Configuración → `<h3>` (el CSS de Tailwind preflight ya resetea estilos de headings: cero cambio visual).
- **Controles con nombre (⑩)**: `aria-label="Refrescar datos"` en el botón `↻`; `aria-pressed={auto}` en el toggle AUTO.
- **Foco visible (⑩)**: estilos `:focus-visible` centralizados en `index.css` para `.btn`, `.in` y la nav de enlaces.
- **Etiquetas de formulario**: `Field` vuelve a renderizar `<label>` envolviendo al control (asociación implícita válida) con `biome-ignore` justificado para `noLabelWithoutControl`.
- **SVG de memoria (⑨)**: se añaden `<title>` y `<desc>` dentro del `<svg>` (complementa el `aria-label` existente).

## Capabilities

### New Capabilities

- `ui-accessibility`: fundamentos de accesibilidad de la UI — jerarquía de encabezados, nombres accesibles en controles, estados de toggle expuestos y foco de teclado visible.

### Modified Capabilities

<!-- Ninguna. -->

## Impact

- **Web**: `App.tsx` (h1), `Panel.tsx` (h2), `Configuracion.tsx` (h3 de grupos), `RefreshControl.tsx` (aria), `Field.tsx` (label), `Memoria.tsx` (title/desc), `index.css` (focus-visible).
- **Visual**: cero cambios de apariencia (preflight resetea headings; el foco solo aparece con teclado).
- **Riesgo**: bajo — cambios de marcado semántico; 124 tests y el build cubren regresiones.
