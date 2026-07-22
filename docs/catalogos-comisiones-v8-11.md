# SGI V8.11 - Catálogos multifiltro/PDF y esquemas comisionales

## Catálogos comerciales

- Selección múltiple de categoría o marca, subcategoría y familia.
- Consulta de filtros sobre la selección completa de la línea de negocio.
- Banners configurables por subcategoría, almacenados por línea de negocio.
- Nuevas variables visuales: fondo general, fondo de tarjetas, color de texto y orientación de impresión.
- Portada y banners se incluyen como imágenes reales para conservarlos al imprimir.
- Controles interactivos ocultos mediante reglas específicas de impresión.
- Carga controlada de imágenes antes de abrir el diálogo de impresión/PDF.

## Liquidación de comisiones

- Editor de esquemas convertido en modal superpuesto.
- Consulta de versiones activas en modo solo lectura.
- Botón explícito para activar una versión.
- Confirmación de activación con explicación de efectos sobre versiones y liquidaciones.
- Se mantiene la regla de auditoría: una versión activa no se modifica; los cambios generan una versión nueva.

## Base de datos

- Nuevos campos visuales en `catalog_visual_configs`.
- Nueva tabla `catalog_subcategory_banners` para asociar imágenes a línea y subcategoría.
