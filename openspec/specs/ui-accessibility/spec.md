# ui-accessibility Specification

## Purpose

Define los fundamentos de accesibilidad de la UI: jerarquía de encabezados semántica, nombres accesibles en todos los controles, estado expuesto de los toggles y foco de teclado visible, de modo que tecnologías asistivas puedan operar el dashboard.

## Requirements

### Requirement: Jerarquía de encabezados semántica

La aplicación SHALL tener un único `h1` (la marca) y SHALL usar headings (`h2` en adelante) para los títulos de paneles y grupos de sección, en orden jerárquico sin saltos.

#### Scenario: Outline de encabezados

- **WHEN** se inspecciona el outline de headings de cualquier página
- **THEN** existe exactamente un `h1` (brand) y los títulos de panel aparecen como `h2` debajo

### Requirement: Controles con nombre accesible

Todo control interactivo SHALL tener nombre accesible: los botones de solo-icono mediante `aria-label`, y los toggles SHALL exponer su estado on/off mediante `aria-pressed`.

#### Scenario: Botón de solo icono

- **WHEN** un lector de pantallas encuentra el botón de refresh (icono `↻`)
- **THEN** anuncia su propósito ("Refrescar datos") en lugar de ningún nombre

#### Scenario: Estado del toggle AUTO

- **WHEN** el toggle AUTO está activado o desactivado
- **THEN** el botón expone `aria-pressed` acorde al estado actual

### Requirement: Foco de teclado visible

Los controles interactivos SHALL mostrar un indicador de foco distinguible al navegar con teclado (`:focus-visible`), sin afectar la apariencia al usar puntero.

#### Scenario: Navegación con teclado

- **WHEN** el usuario recorre los controles con la tecla Tab
- **THEN** el control enfocado muestra un anillo/borde visible de foco

### Requirement: Gráfico SVG accesible

El grafo SVG de memoria SHALL incluir texto alternativo tanto en atributo (`aria-label`) como en elementos hijos (`<title>` y `<desc>`).

#### Scenario: Lectura del grafo

- **WHEN** un lector de pantallas encuentra el SVG del grafo de memoria
- **THEN** anuncia su rol de imagen, su etiqueta y su descripción
