# Listas de precios V8.3 - Corrección de carga e imágenes

## Corrección de productos vacíos

La consulta SQL de productos y sus filtros se restauraron exactamente desde la V8.1 estable. La V8.2 había agregado la construcción de la URL de imagen dentro del `SELECT`, lo que podía provocar que la consulta a Odoo fallara y, en listas sin respaldo local como Motopartes, devolviera cero productos.

La URL se genera ahora exclusivamente en Node después de recibir cada fila:

`https://lopezbicipartes.com.ar/web/image/product.product/{product_id}/image_1024/`

Esto evita alterar la consulta validada y mantiene el filtro de Motopartes por `MOTOCICLISMO`.

## Pantalla interna

- Miniatura de 48 x 48 píxeles con carga diferida.
- Nombre del producto enlazado a la imagen.
- Vista previa flotante grande al pasar el cursor o enfocar el enlace.
- Clic para abrir la imagen en una pestaña nueva.

## HTML descargable

- Miniatura al lado del nombre.
- Nombre enlazado sin exponer la URL en texto.
- Vista previa flotante de hasta 380 x 380 píxeles mediante CSS.
- En dispositivos táctiles se mantiene el enlace y se oculta la vista previa flotante.

## IVA

Se mantiene la configuración global de IVA agregada en V8.2.
