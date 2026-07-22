# Catálogos Comerciales V8.8 - Productos publicados en web

## Cambio funcional

El filtro `Solo productos con imagen` fue reemplazado por `Solo productos publicados en web`.

La disponibilidad de la fotografía pública depende de que el producto esté publicado en el eCommerce de Odoo. Por eso, la publicación web es el criterio correcto para generar catálogos externos.

## Fuente Odoo

La consulta obtiene el estado de publicación desde `product_template`. Para mantener compatibilidad entre instalaciones, contempla los campos `is_published` y `website_published` mediante `to_jsonb`, evitando errores cuando uno de ellos no existe en el esquema.

## Comportamiento

- Activado: se incluyen únicamente productos publicados en la web.
- Desactivado: se pueden visualizar todos los productos comerciales de la línea, aunque no estén publicados.
- El filtro se aplica en la consulta Odoo, en la vista previa, en las categorías/marcas y en la descarga HTML.
- La URL de imagen continúa armándose con el ID de `product.product`.
