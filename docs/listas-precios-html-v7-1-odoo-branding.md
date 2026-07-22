# Listas de precios HTML v7.1 - Odoo, branding y stock comercial

## Objetivo

Convertir las listas de precio que hoy se distribuyen en Excel en listas HTML responsive descargables desde la aplicación, optimizadas para celular y sin depender de segmentadores de Excel.

## Fuente de datos

La versión v7.1 intenta consultar Odoo usando una query simplificada basada en el maestro de precios/stock provisto. Si la consulta a Odoo falla, la app mantiene respaldo con la base semilla para Bicipartes y Bicicletas.

Datos usados:

- SKU
- Artículo
- Marca
- Modelo
- Familia
- Subcategoría
- Categoría
- Negocio
- Precio base
- Stock real
- Stock disponible para venta
- Presentación inner/master
- Cantidad mínima

## Reglas comerciales

- Precio distribuidor = precio base * 0,65
- Precio contado 7 días = precio distribuidor * 0,92
- Los precios se muestran con IVA incluido.

## Listas disponibles

- Bicipartes Distribuidor
- Bicicletas PRO / URBANO Distribuidor
- Motopartes Distribuidor
- Movilidad Eléctrica Distribuidor
- Autopartes / Neumáticos Distribuidor

## Agrupación

### Bicipartes, Motopartes, Movilidad y Autopartes

Se agrupan como el Excel:

1. Categoría
2. Subcategoría
3. Familia
4. Productos ordenados por artículo y SKU

### Bicicletas

Se filtra por:

- Marca
- Modelo

Y se agrupa por:

1. Marca
2. Modelo
3. Productos ordenados por artículo y SKU

## Stock

Se separó el filtro real de productos de la visualización de stock:

- `Solo productos con stock`: filtra los productos incluidos en la lista y en la descarga HTML.
- `Mostrar stock real`: muestra cantidades.
- `Mostrar Disponible / Consultar`: muestra estado comercial sin exponer cantidades.

La descarga HTML respeta los filtros activos. Si se descarga con `Solo productos con stock` activo y modo `Disponible / Consultar`, el HTML incluye solo productos disponibles y no muestra cantidades.

## Branding

El HTML descargable incorpora:

- Logo LH Bicicletas/Bicipartes
- Logo Forte para Motopartes/Autopartes
- Banner Topmega para Bicicletas/Bicipartes
- Tira de logos de marcas para Bicicletas/Bicipartes
- Estilo visual oscuro/rojo/verde para Forte
- Estilo azul/comercial para Bicicletas/Bicipartes

Los assets se referencian por URL para evitar aumentar el peso del paquete. Si alguna URL externa bloquea el acceso, la lista sigue funcionando sin romper la tabla.

## Endpoints

- `GET /api/price-lists`
- `GET /api/price-lists/:key`
- `GET /api/price-lists/:key/download-html`

