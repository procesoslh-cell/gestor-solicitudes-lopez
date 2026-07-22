# Listas de precios V8.2 - Imágenes e IVA configurable

## Imágenes

- Se construye la URL pública con el ID de `product.product`:
  `https://lopezbicipartes.com.ar/web/image/product.product/{id}/image_1024/`.
- En el HTML descargable el nombre del producto funciona como vínculo a la imagen.
- En equipos con mouse, al pasar el cursor se abre una vista previa flotante de hasta 380 x 380 px.
- El clic abre la imagen en una pestaña nueva.
- Si el producto no tiene imagen o la URL falla, la vista previa se oculta sin romper la lista.

## IVA

La consulta de Odoo toma `product_pricelist_item.fixed_price` sin agregar impuestos. La versión V8.2 trata ese importe como precio neto y calcula:

- Precio de lista con IVA.
- Precio Distribuidor/Mostrador con descuento e IVA.
- Precio contado con descuento de canal, descuento de contado e IVA.

El IVA es global y configurable por administrador. El valor inicial es 21%; 0% evita agregar IVA.

## Configuración

La pantalla `Listas de precios > Configurar precios` permite editar:

- IVA.
- Descuento contado 7 días.
- Descuento Distribuidor y Mostrador por unidad de negocio.

La variable opcional `PRODUCT_IMAGE_BASE_URL` permite cambiar el dominio público usado para las imágenes.
