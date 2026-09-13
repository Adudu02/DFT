# Tasks: web-a11y-foundations

## 1. Jerarquía de encabezados (⑧)

- [x] 1.1 `web/src/App.tsx`: brand `span.brand` → `h1.brand` (mismas clases). Verificar: grep muestra `<h1` y solo uno en la app.

- [x] 1.2 `web/src/components/Panel.tsx`: `div.kicker` → `h2.kicker`. Verificar: grep muestra `<h2` en Panel.

- [x] 1.3 `web/src/pages/Configuracion.tsx`: las 3 etiquetas de grupo (Fugas, Downgrade paths, Rutas de agentes) → `h3` con sus clases actuales. Verificar: grep muestra 3 `<h3`.

## 2. Controles con nombre y estado (⑩)

- [x] 2.1 `web/src/components/RefreshControl.tsx`: `aria-label="Refrescar datos"` en el botón `↻`; `aria-pressed={auto}` en el toggle AUTO. Verificar: grep muestra ambos atributos.

- [x] 2.2 `web/src/components/Field.tsx`: `<div>` → `<label>` envolvente con comentario `biome-ignore` para `noLabelWithoutControl` documentando la asociación implícita. Verificar: `pnpm lint` sin errores nuevos.

## 3. Foco visible y SVG (⑨⑩)

- [x] 3.1 `web/src/index.css`: reglas `:focus-visible` (anillo `--gold-bright` 2px con offset) para `.btn`, `.in`, nav y botones del refresh. Verificar: grep muestra las reglas.

- [x] 3.2 `web/src/pages/Memoria.tsx`: añadir `<title>` y `<desc>` como hijos del `<svg>`. Verificar: grep muestra ambos elementos.

## 4. Verificación integral

- [x] 4.1 Ejecutar `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` — todo en verde. Verificar: salida limpia en los cuatro comandos.
