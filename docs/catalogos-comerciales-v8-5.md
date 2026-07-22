# Catálogos comerciales V8.5

## Objetivo

Resolver dentro del SGI la generación de catálogos por línea de negocio sin depender de procesos manuales externos.

## Roles

- Supervisor, Jefe y Administrador: configuran diseño y generan.
- Gerente: visualiza y genera.
- Vendedor: no accede al módulo en esta primera versión.

## Fuente

Reutiliza la consulta validada del módulo Listas de Precios. La URL de imagen se genera en Node a partir de `product.product.id`, sin modificar el SQL de Odoo.

## Configuración por línea

- Título y subtítulo.
- Texto de campaña y vigencia.
- Portada y banner de categorías.
- Logo.
- Colores principal y secundario.
- Estilo moderno, clásico o compacto.
- Mostrar precios, contado y disponibilidad.
- Solo productos disponibles y/o con URL de imagen.

## Salida

El HTML descargable es autónomo para portada y banners cargados en el SGI. Las imágenes de producto se consultan desde la URL pública de Odoo. Incluye buscador, navegación por categorías y opción de impresión/guardado como PDF desde el navegador.

## Persistencia

- `catalog_visual_configs`: configuración visual por línea.
- `catalog_generations`: historial de archivos generados.
- `uploads/catalogs`: portadas y banners cargados.
