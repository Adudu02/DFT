# Design: web-a11y-foundations

## Context

Cero headings en toda la web (`grep "<h"` vacío): el brand es `span.brand` y los títulos de panel `div.kicker`. `RefreshControl` tiene un botón `↻` sin nombre y un toggle AUTO sin estado expuesto. El `Field` renderiza `<div>` desde el fix de Biome (antes `<label>` envolvente, que sí era la asociación válida). El SVG de Memoria ya lleva `role="img"` + `aria-label` desde el fix de lint. Ver proposal.md.

## Goals / Non-Goals

**Goals:**

- Outline semántico completo (h1 → h2 → h3) sin cambio visual.
- Nombres accesibles y estado en todos los controles interactivos.
- Foco de teclado visible y consistente, centralizado en CSS.

**Non-Goals:**

- No se implementan atajos de teclado tipo roving-tabindex sobre la nav: es navegación de rutas (enlaces), no un widget de tabs — el orden de Tab nativo es el correcto.
- No se auditan contrastes de color ni textos alternativos de gráficos Recharts (candidato a un change a11y posterior).
- No se tocan las páginas salvo Configuración (h3 de grupos).

## Decisions

1. **Headings con clases existentes.** `span.brand` → `h1.brand`, `div.kicker` → `h2.kicker`, grupos de Configuración → `h3` con sus clases actuales. Tailwind Preflight ya resetea font-size/margin de headings, así que el render es idéntico; la semántica cambia.
2. **`Field` vuelve a `<label>` envolvente + `biome-ignore`.** La asociación implícita (label que contiene al control) es la válida aquí — Biome la marca porque no puede verificar estáticamente que `children` contenga un control; el comentario lo documenta. Alternativa descartada: `htmlFor` + `id` generados — requiere plumbing de ids sin beneficio adicional.
3. **Foco centralizado en `index.css`.** Una regla `:focus-visible` para `.btn`, `.in`, la nav y botones de refresco — anillo carmesí (`--gold-bright`) de 2px con offset. Mejor que `focus:ring-*` disperso por componente: un solo punto de mantenimiento y sin riesgo de omitir controles nuevos.
4. **`aria-pressed` derivado del estado.** El toggle AUTO ya renderiza condicional por `auto`; se añade `aria-pressed={auto}` — el visual no cambia y el estado queda expuesto.
5. **⑦ se documenta, no se implementa.** `NavLink` emite `aria-current="page"` (navegación resaltada semánticamente); convertir la nav en `role="tablist"` contradiría WAI-ARIA APG (tabs es para widgets in-page). Queda registrado en design/proposal como satisfecho por la arquitectura de rutas.

## Risks / Trade-offs

- [El h1 con estilos de brand hereda márgenes de UA] → Preflight de Tailwind neutraliza márgenes y tamaño de headings; se verifica visualmente en el build.
- [biome-ignore en Field oculta un caso real] → El comentario especifica el contrato (children contiene el control); si algún uso de Field no envolviera un control, sería un bug de uso, no del componente.

## Migration Plan

Sin migración (marcado semántico). Rollback = revertir el PR.

## Open Questions

Ninguna que bloquee implementación.
