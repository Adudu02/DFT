# Design: config-json-validation-feedback

## Context

`Configuracion.tsx` maneja dos textareas con estrategias distintas: pricing usa texto libre (`pricingText`) y valida al guardar; downgrade-paths es un controlado derivado de `form` (`value={JSON.stringify(form.waste.downgradePaths, null, 2)}`) con `onChange` que hace `JSON.parse` y descarta en `catch {}`. La consecuencia del control derivado: con JSON inválido el estado no cambia, React re-renderiza y el textarea revierte al último valor válido — la edición se pierde y nunca hay feedback (ver proposal.md).

## Goals / Non-Goals

**Goals:**

- Edición fluida: el textarea conserva siempre lo tecleado.
- Feedback inmediato y específico (motivo del error de parseo) usando `term-red`.
- Nunca enviar al backend un JSON distinto del que el usuario ve.

**Non-Goals:**

- No se valida el *contenido* semántico del JSON (tipos, claves desconocidas) — eso sigue siendo del backend al hacer PUT.
- No se toca el textarea de pricing (ya tiene feedback al guardar; unificarlo es otra mejora).
- No se introduce una librería de formularios ni de schemas (zod, etc.).

## Decisions

1. **Estado local de texto + derivación en un solo sentido.** `downgradeText` vive como estado local (patrón ya existente con `pricingText`), inicializado desde `form` cuando carga la config. `onChange`: guarda el texto, intenta `JSON.parse`; si es válido actualiza `form` y limpia el error; si no, setea el error. El `value` del textarea es el estado local, nunca la derivación de `form`. Alternativa descartada: mantener el controlado y solo añadir un aviso — no resuelve la reversión del texto.
2. **Validación por intento de parseo, no regex.** `JSON.parse` + `String(e)` truncado da el motivo exacto (posición del token inesperado). Sin dependencias nuevas.
3. **Guardar deshabilitado mientras haya error.** El botón «Guardar configuración» queda inactivo si `jsonError !== null`. Alternativa descartada: dejar guardar el último JSON válido — el usuario creería guardar lo que ve, exactamente la confusión que motiva el cambio.
4. **Error por campo, no global.** El error de downgrade-paths se muestra bajo su textarea; no se reutiliza el banner global `msg`/`failed` (reservado al resultado de las operaciones de guardado/rebuild).
5. **Resincronización solo desde el backend.** Cuando `cfg` se recarga (tras guardar o rebuild vía `key`), `form` y `downgradeText` se resincronizan del valor del servidor; las ediciones locales no se pisan en otro momento.

## Risks / Trade-offs

- [El usuario edita y deja inválido el campo, y luego un rebuild resincroniza el texto] → Solo ocurre tras operaciones explícitas del usuario (guardar/rebuild); es el comportamiento esperable de «el servidor manda».
- [Doble fuente de verdad (texto local vs. form) puede divergir] → Solo hay dos puntos de escritura de cada una (carga inicial/guardado para `form`; `onChange` para el texto) y la transición válido→`form` es determinista; se cubre verificando el flujo en la página.
- [`String(e)` de JSON.parse es técnico (en inglés, con posición)] → Es el mismo formato que ya muestra `savePricing` en su error; consistencia antes que traducción.

## Migration Plan

Sin migración: cambio contenido en un componente. Rollback = revertir el commit.

## Open Questions

Ninguna que bloquee implementación.
