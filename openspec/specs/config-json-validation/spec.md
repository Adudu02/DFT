# config-json-validation Specification

## Purpose

Define el comportamiento de validación en vivo de los campos JSON del formulario de configuración: edición libre del texto, feedback inmediato de los errores de parseo y bloqueo del guardado mientras el JSON visible sea inválido.

## Requirements

### Requirement: Edición libre de campos JSON

El formulario de configuración SHALL permitir escribir libremente en los campos JSON (incluidos estados intermedios inválidos) sin revertir ni reformatear el texto tecleado, y SHALL sincronizar su estado interno únicamente cuando el texto visible sea JSON válido.

#### Scenario: Edición a medio camino queda en pantalla

- **WHEN** el usuario edita el campo de downgrade-paths dejándolo en un estado JSON inválido (por ejemplo, borra una llave de cierre)
- **THEN** el textarea conserva exactamente el texto tecleado y no revierte al último valor válido

#### Scenario: JSON válido se incorpora al formulario

- **WHEN** el texto del campo pasa a ser JSON válido tras una edición
- **THEN** el formulario incorpora el valor parseado y el indicador de error, si existía, desaparece

### Requirement: Feedback inmediato de JSON inválido

El formulario SHALL mostrar un indicador visual distinguible (borde rojo y mensaje con el motivo del error) junto al campo mientras su texto visible no sea JSON válido, sin esperar a que el usuario pulse Guardar.

#### Scenario: Error visible al instante

- **WHEN** el texto del campo deja de ser JSON válido
- **THEN** el campo muestra borde rojo y un mensaje con el motivo del error de parseo, en la misma actualización

### Requirement: Guardado bloqueado con JSON inválido

El formulario SHALL impedir guardar la configuración mientras algún campo JSON editable visible sea inválido.

#### Scenario: Guardar deshabilitado con error presente

- **WHEN** el campo de downgrade-paths contiene JSON inválido y el usuario intenta pulsar «Guardar configuración»
- **THEN** el botón está deshabilitado y no se envía ninguna petición de guardado
