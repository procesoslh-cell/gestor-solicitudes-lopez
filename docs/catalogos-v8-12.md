# SGI V8.12 - Banners configurables del catálogo

## Alcance

- Controles independientes para mostrar el banner de categoría y el banner de subcategoría.
- El banner de categoría se integra al panel lateral de navegación del HTML.
- El nombre de la categoría activa se actualiza al navegar por el catálogo.
- El lateral completo se oculta al imprimir, por lo que el banner de categoría no forma parte del PDF.
- El PDF mantiene un encabezado de categoría basado en la combinación de colores del catálogo, sin reutilizar la imagen del banner.
- El banner de subcategoría permanece dentro del contenido y se exporta al PDF cuando está habilitado.
- Cuando el banner de subcategoría está deshabilitado, se utiliza un encabezado tipográfico simple.
- Se eliminaron los rótulos genéricos “Categoría” y “Subcategoría” dentro de los banners.

## Configuración

Los nuevos campos persistentes son:

- `show_category_banner`
- `show_subcategory_banner`

Ambos se guardan por línea de negocio dentro de `catalog_visual_configs`.
