# Proposal: config-json-validation-feedback

## Why

En el formulario de Configuración, el textarea de downgrade-paths es un componente controlado cuyo `value` se deriva de `form` (`JSON.stringify(form.waste.downgradePaths)`): al escribir JSON inválido a medio editar, el `catch {}` silencioso hace que el textarea revierta el texto tecleado en el re-render. El usuario no puede ni siquiera producir JSON mal formado para corregirlo — el campo "lucha" contra la edición — y no recibe ningún mensaje de error (ítem ④ de `MEJORAS.md`, agravado por el control derivado). El feedback hoy solo aparece al pulsar Guardar (y con el JSON viejo, no el visible).

## What Changes

- El textarea de downgrade-paths pasa a tener estado local de texto (como ya lo tiene el de pricing), sincronizado con `form` solo cuando el JSON es válido: se puede escribir libremente, incluidos estados intermedios inválidos.
- Feedback inmediato de validación en `onChange`: borde rojo (`border-term-red`) + mensaje con el motivo del error de parseo debajo del campo; el indicador desaparece al volver a JSON válido.
- Mientras el JSON visible es inválido, el botón «Guardar configuración» se deshabilita — evita guardar silenciosamente el último JSON válido mientras el usuario cree estar guardando lo que ve.

## Capabilities

### New Capabilities

- `config-json-validation`: validación en vivo de los campos JSON del formulario de configuración — edición libre con feedback inmediato y bloqueo de guardado mientras el JSON visible sea inválido.

### Modified Capabilities

<!-- Ninguna: los requisitos existentes (skills-ingestion) no cambian. -->

## Impact

- **Código**: `web/src/pages/Configuracion.tsx` (único archivo — estado local `downgradeText`/error, `onChange` con validación, estilo condicional, botón condicional).
- **UI**: solo la página Configuración; el textarea de pricing no cambia (ya usa texto libre y valida al guardar con mensaje de error).
- **API/DB**: sin cambios — la validación es del lado cliente antes del PUT existente.
- **Complementario**: usa `term-red` (#ef4444), el color de error separado del acento en el cambio anterior.
- **Riesgo**: bajo — componente aislado; los tests del server no se ven afectados.
