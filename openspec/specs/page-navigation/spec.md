# page-navigation Specification

## Purpose

Define la navegación de la aplicación por URL: rutas estables por página, deep links operativos tras recargar (fallback SPA del servidor) y comportamiento ante rutas desconocidas.

## Requirements

### Requirement: Rutas estables por página

Cada página SHALL ser accesible mediante una ruta URL estable y navegable con los controles atrás/adelante del navegador; la navegación SHALL resaltar la página activa.

#### Scenario: Navegación a una página

- **WHEN** el usuario navega a la ruta de una página (enlace o URL)
- **THEN** la página correspondiente se muestra y su entrada en la navegación aparece resaltada

#### Scenario: Back/forward del navegador

- **WHEN** el usuario usa atrás/adelante tras visitar varias páginas
- **THEN** la app vuelve a mostrar la página correspondiente a cada entrada del historial

### Requirement: Deep links con recarga

El servidor SHALL servir la aplicación para cualquier ruta de página no-API, de modo que recargar o abrir directamente una URL profunda muestre la página correspondiente; las rutas `/api/*` desconocidas SHALL seguir respondiendo 404 JSON.

#### Scenario: Recarga de un deep link

- **WHEN** el usuario recarga el navegador estando en una ruta de página
- **THEN** el servidor entrega la aplicación y la página correspondiente se muestra de nuevo

#### Scenario: Ruta API desconocida

- **WHEN** se solicita una ruta `/api/*` inexistente
- **THEN** la respuesta es 404 JSON y no se sirve la aplicación

### Requirement: Rutas desconocidas redirigen al inicio

La aplicación SHALL redirigir las rutas que no corresponden a ninguna página hacia la ruta de inicio.

#### Scenario: URL inexistente

- **WHEN** el usuario navega a una ruta que no corresponde a ninguna página
- **THEN** la aplicación muestra la página de inicio en la ruta `/`
