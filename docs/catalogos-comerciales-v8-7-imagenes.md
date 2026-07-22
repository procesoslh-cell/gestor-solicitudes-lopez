# V8.7 - Corrección de carga de imágenes de catálogos

- Se eliminan parámetros de caché personalizados de las URLs de Odoo.
- El HTML utiliza exactamente la misma URL pública que abre el enlace del producto.
- Las imágenes se cargan mediante una cola limitada a 3 solicitudes simultáneas en escritorio y 2 en móvil.
- Se mantienen alternativas `image_512` e `image_1920` solo ante error HTTP real.
- Se agrega `referrerpolicy=no-referrer` para evitar diferencias entre la carga embebida y la apertura directa.
- La vista previa interna aplica el mismo criterio de URL directa.
