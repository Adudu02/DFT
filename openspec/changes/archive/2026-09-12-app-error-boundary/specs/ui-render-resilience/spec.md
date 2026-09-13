## Purpose

Define la resiliencia de la UI ante excepciones de render: un error en una página queda acotado a esa página, se informa con un panel de error accesible y el usuario puede reintentar o navegar a otra pestaña sin recargar.

## ADDED Requirements

### Requirement: Aislamiento de errores de render por página

La aplicación SHALL contener las excepciones lanzadas durante el render de una página dentro de un boundary propio, de modo que el header y la navegación permanezcan visibles y operativos cuando una página falla.

#### Scenario: Página lanza durante el render

- **WHEN** el render de la página activa lanza una excepción
- **THEN** se muestra un panel de error en el área de contenido con el mensaje de la excepción, y el header con las pestañas sigue visible y navegable

### Requirement: Reintento de la página fallida

El panel de error SHALL ofrecer una acción de reintento que remonte la página afectada y limpie el estado de error; además, cambiar de pestaña SHALL iniciar la nueva página sin el error anterior.

#### Scenario: Reintentar tras un fallo

- **WHEN** el usuario pulsa «Reintentar» en el panel de error
- **THEN** el estado de error se limpia y la página se remonta desde cero (re-ejecutando sus cargas de datos)

#### Scenario: Navegación limpia a otra pestaña

- **WHEN** tras un fallo de render el usuario navega a otra pestaña
- **THEN** la nueva página se monta sin estado de error heredado

### Requirement: Panel de error accesible

El panel de error SHALL ser anunciado por tecnologías asistivas (rol de alerta) y SHALL mostrar el mensaje de la excepción en texto legible, coherente con el tema visual de la aplicación.

#### Scenario: Anuncio del error

- **WHEN** se muestra el panel de error
- **THEN** el contenedor tiene rol de alerta e incluye el mensaje de la excepción
