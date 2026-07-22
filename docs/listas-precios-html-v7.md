# Listas de precios HTML - V7

## Objetivo

Crear un módulo para que los asesores puedan consultar y descargar listas de precios en HTML responsive, evitando el uso de archivos Excel con segmentadores que no funcionan bien en celulares.

## Alcance de esta primera versión

- Nuevo módulo lateral: **Listas de precios**.
- Listas iniciales cargadas desde los Excel de referencia:
  - Bicipartes Distribuidor.
  - Bicicletas PRO / URBANO Distribuidor.
- Vista responsive dentro de la app.
- Descarga de HTML independiente.
- Exportación CSV.
- Filtros por:
  - búsqueda SKU/producto/marca/modelo/familia,
  - categoría,
  - subcategoría,
  - familia,
  - marca,
  - solo productos con stock.
- Opción de visualización de stock:
  - stock real,
  - Disponible / Consultar.
- Agrupación visual:
  - categoría,
  - subcategoría,
  - familia,
  - artículos ordenados por nombre para que variantes de color/talle queden juntas.

## Reglas comerciales aplicadas

- Precio distribuidor: se toma desde la columna distribuidor del archivo base.
- Si falta precio distribuidor, se estima como precio lista * 0,65.
- Precio contado 7 días: precio distribuidor * 0,92.
- Precios con IVA incluido.

## Pendientes

- Reemplazar fuente Excel por consulta directa a Odoo.
- Agregar Motopartes, Movilidad Eléctrica y Autopartes.
- Configurar descuentos por negocio desde pantalla.
- Historial de listas generadas.
- Publicación por link interno.
- Modo cliente queda pendiente para una etapa futura.
