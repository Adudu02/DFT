## Purpose

Define la detección e ingesta de usos de skills (comandos `/skill` en mensajes de usuario) desde los transcripts de cada agente soportado, garantizando que ningún agente con formato soportado quede excluido del agregado de skills del sistema.

## ADDED Requirements

### Requirement: Ingesta de skills de Qwen

El sistema SHALL detectar los usos de skills en los transcripts de Qwen durante la ingesta y SHALL exponerlos junto a los usos detectados de los demás agentes.

#### Scenario: Uso de skill en transcript de Qwen

- **WHEN** la ingesta procesa un transcript de Qwen que incluye un uso de skill en un mensaje de usuario
- **THEN** el uso queda registrado asociado a su skill y sesión, y aparece en el agregado de skills consultable (getSkills / página Skills)

#### Scenario: Transcript de Qwen sin skills

- **WHEN** la ingesta procesa un transcript de Qwen que no contiene usos de skills
- **THEN** no se registran usos de skills para esa sesión y la ingesta completa termina sin errores

### Requirement: Cobertura de skills por agente soportado

La consulta agregada de skills SHALL reflejar los usos de skills de todos los agentes cuyo formato de skill esté soportado, sin excluir agentes completos.

#### Scenario: Vista agregada de skills

- **WHEN** existen transcripts con usos de skills de Claude Code, Codex y Qwen y se ejecuta la ingesta
- **THEN** el agregado de skills incluye usos provenientes de los tres agentes
