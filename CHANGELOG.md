# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo. El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-06-18

### Añadido
- Nueva sección de Changelog en el proyecto.
- Resaltado de sintaxis estilo VS Code para la vista detallada de código auditado.

### Modificado
- Rediseño completo de la interfaz de usuario del popup para coincidir con el diseño mockup (indicadores circulares de puntuación, pestañas en formato píldora y tarjetas de auditoría).
- Reemplazo de emojis en la interfaz por insignias circulares y limpios indicadores de estado.
- Nuevos iconos de extensión basados en el logotipo azul "W" de Webflow.
- Aumento de los tamaños de fuente predeterminados y mejoras en la accesibilidad general de la extensión.

### Solucionado
- Error de visualización en la navegación entre pestañas restaurando la clase helper oculta (`.hidden`).
- Typo en la variable `uniqueDupes` del check de accesibilidad de acceskeys.
- Envoltura de `content.js` en una guarda de ejecución para evitar errores de tipo `SyntaxError` por inyecciones múltiples del script.
- Corrección en la localización y resaltado de elementos mediante la generación de IDs deterministas.
- Auto-anotación garantizada de elementos tras el despacho del localizador.
