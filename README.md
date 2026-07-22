## Novedades V8.12

- Catálogos: controles independientes para banner de categoría y banner de subcategoría.
- El banner de categoría se integra al lateral del HTML y no se imprime en PDF.
- El banner de subcategoría permanece dentro del contenido y puede incluirse en PDF.
- Se eliminan los rótulos genéricos “Categoría” y “Subcategoría” de los banners.

## V8.11 - Catálogos multifiltro/PDF y esquemas comisionales mejorados

- Catálogos incorpora selección múltiple con tildes para categoría o marca, subcategoría y familia.
- Los filtros dependientes permiten combinar varias subcategorías y familias dentro de una misma generación.
- Supervisor/Jefe puede cargar un banner específico por subcategoría desde su PC; si no existe, se utiliza el banner general.
- Diseño y portada suma fondo del catálogo, fondo de tarjetas, color de texto y orientación del PDF.
- El HTML oculta buscador, navegación y controles al imprimir; mantiene portada, banners, fondos, colores y tarjetas.
- El botón **Generar / Guardar PDF** carga previamente todas las imágenes y muestra avance antes de abrir la impresión.
- La edición o consulta de esquemas comisionales se abre en una ventana modal centrada.
- La activación de esquemas deja de usar el control ambiguo: ahora existe un botón claro y un modal de confirmación.
- Los esquemas activos son de solo lectura; cualquier cambio se realiza creando una nueva versión.

## V8.10 - Menú reordenable y detalle de comisiones superpuesto

- El menú lateral permite reordenar los módulos mediante arrastrar y soltar desde el asa de cada opción.
- El orden se guarda en el navegador de forma independiente por usuario y rol.
- También se puede mover una opción con las flechas arriba/abajo cuando el asa tiene foco.
- El menú lateral incorpora scroll interno para mantener visible la tarjeta del usuario aun con muchos módulos.
- El detalle de una liquidación se abre ahora en una ventana modal centrada sobre la tabla.
- Se agregaron fondo desenfocado, animaciones de apertura/cierre, cierre con Escape, clic fuera de la ventana y cabecera/acciones fijas.
- La vista modal se adapta a escritorio, tablet y celular.

## V8.9 - Liquidación de Comisiones

- Nuevo módulo de configuración y cálculo mensual de comisiones.
- Esquemas versionados con vigencia, reglas por canal/rubro, escalas de alcance, cobranzas, clientes y multiplicadores.
- Preliquidación por asesor con detalle auditable, ajustes manuales, penalizaciones e historial.
- Flujo Supervisor/Jefe → RRHH con aprobación, devolución o rechazo.
- Vista gerencial de solo lectura y exportación CSV.
- Nuevos roles: Jefe de ventas, Gerente y RRHH.
- La fotografía de facturas y cobranzas se congela al enviar a RRHH.

## V8.5 - Catálogos comerciales automáticos

- Nuevo módulo **Catálogos comerciales** para Supervisor, Jefe, Gerente y Administrador.
- Generación directa desde los mismos productos, imágenes, categorías, marcas, precios y stock utilizados por Listas de Precios.
- Configuración visual por línea de negocio: portada, banner de categorías, título, campaña, vigencia, colores y estilo de tarjetas.
- Filtros por línea/lista, categoría, marca, stock, imagen y búsqueda.
- Precio, contado y disponibilidad opcionales.
- Vista previa dentro del SGI y descarga HTML autónoma con búsqueda, navegación por categorías y botón **Imprimir / Guardar PDF**.
- Historial de catálogos generados con usuario, fecha, fuente y cantidad de productos.
- La generación no requiere aprobación ni intervención de Marketing.

## V8.4 - Auditoría del proyectado comercial

- La auditoría de Objetivos Comerciales ahora muestra los pedidos que forman el importe **A facturar / Proyectado**.
- Se incorporó un resumen por pedido y un detalle por línea con producto, cantidades, precio unitario, descuento y subtotal.
- El proyectado dejó de priorizar `sale_order_line.price_total` y utiliza `sale_order_line.price_subtotal`, que incluye cantidad y descuento de línea pero excluye IVA e impuestos.
- Se muestran por separado venta neta facturada, A facturar sin IVA y venta total proyectada.
- Se agregaron exportaciones CSV de pedidos proyectados y líneas proyectadas.

## V8.3 - Corrección de listas e imágenes

- Se restauró exactamente la consulta y los filtros Odoo de la V8.1 para evitar listas vacías.
- La URL de imagen ya no se construye dentro del SQL; se genera en Node a partir de `product_id`.
- La pantalla interna muestra una miniatura del producto y el nombre enlazado a la imagen.
- Al pasar el cursor o enfocar el nombre aparece una vista previa grande sin salir de la lista.
- El HTML descargable incorpora la misma miniatura, enlace y vista previa.
- Se conserva el IVA configurable incorporado en V8.2.

## V8.2 - Imágenes de producto e IVA configurable

- Las listas HTML vinculan el nombre del artículo con la imagen pública de `product.product`.
- Al pasar el cursor sobre el nombre se muestra una vista previa grande sin abandonar la lista.
- Los precios base de Odoo se consideran netos y se les aplica el IVA configurado antes de mostrarlos.
- El administrador puede configurar IVA, descuento de contado y descuentos por lista.
- Valor inicial de IVA: 21%. Configurando 0% se desactiva el agregado.



## V8.1 - Limpieza funcional sobre base estable

Backend real: **Node/Express**. La estructura Python anterior fue movida a `legacy/python-fastapi-backend` para no confundir Docker/deploy.

Comandos locales:

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Docker inicial:

```bash
cp backend/.env.example backend/.env
# completar variables Odoo/SMTP
VITE_API_URL=http://localhost:3001 docker compose up --build
```

Health:

- Backend simple: `GET /health`
- Backend con metricas: `GET /api/health`
- Backend + Odoo: `GET /api/health/deep`


## Limpieza V8.1

Se eliminaron del código activo y de la base incluida:

- CRM de oportunidades y actividades.
- Campañas comerciales.
- Hub omnicanal.
- Presupuestos/ventas locales y catálogo local asociado.
- Estructura Next.js antigua de `frontend/app`.

Se mantienen las consultas de pedidos y presupuestos de **Odoo** necesarias para notas de crédito, perfil comercial y cálculo de exposición en Cuenta Cliente.


## V8.6 - Ajustes de Catálogos Comerciales

- El HTML descargable reemplaza el índice horizontal por una navegación lateral fija.
- Bicicletas navega y filtra por marca; Motopartes, Bicipartes y las demás líneas por categoría.
- Las categorías y marcas se consultan desde la selección completa de Odoo, independientemente del límite de la vista previa.
- Las secciones ya no se repiten por subcategoría o modelo.
- Las imágenes usan carga diferida controlada, reintentos y tamaños alternativos para evitar falsos "sin imagen".
- La vista previa del SGI también reintenta imágenes que fallen temporalmente.


## V8.7 - Corrección de imágenes en catálogos

La carga de imágenes utiliza las URLs públicas directas de Odoo sin parámetros adicionales y limita la concurrencia en el HTML descargable.


## V8.8 - Catálogos por publicación web

- Reemplaza `Solo productos con imagen` por `Solo productos publicados en web`.
- Lee el estado de publicación de Odoo desde `product_template.is_published` o `website_published`.
- Aplica el filtro a vista previa, categorías/marcas y HTML descargable.
- Mantiene la generación de imágenes desde `product.product/{id}/image_1024/`.
