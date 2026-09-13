# Tasks: config-json-validation-feedback

## 1. Validación en vivo del textarea de downgrade-paths

- [x] 1.1 En `web/src/pages/Configuracion.tsx`, agregar estado local `downgradeText` (inicializado/sincronizado desde `cfg` junto con `form`) y estado de error de parseo; el `value` del textarea pasa a ser el texto local y el `onChange` valida con `JSON.parse`: válido → actualiza `form` y limpia el error; inválido → conserva el texto y setea el motivo del error. Verificar: leer el componente y confirmar que el `value` ya no se deriva de `form`.

- [x] 1.2 Feedback visual: borde rojo condicional (`border-term-red`) en el textarea y mensaje de error bajo el campo mientras el JSON sea inválido. Verificar: el className del textarea incluye condicional sobre el estado de error.

- [x] 1.3 Deshabilitar «Guardar configuración» mientras exista error de JSON en el formulario. Verificar: el botón tiene `disabled` ligado al estado de error.

## 2. Verificación integral

- [x] 2.1 Ejecutar `pnpm typecheck && pnpm lint && pnpm test && pnpm run build` y confirmar que todo pasa. Verificar: salida limpia en los cuatro comandos.
