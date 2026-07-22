# Objetivos Comerciales V6.4 - Auditoria de conciliacion contra Power BI

Base: V6.3 clasificacion y clientes vendidos.

## Objetivo

Agregar una herramienta de auditoria para detectar diferencias entre el modulo Objetivos Comerciales de la app y el tablero Power BI.

## Nuevo endpoint

`GET /api/commercial-objectives/audit`

Parametros principales:

- `unit`: `ciclismo` o `motociclismo`.
- `period`: periodo en formato `YYYY-MM`.
- `advisorName`: filtro opcional por asesor.
- `advisorId`: filtro opcional por id de asesor.
- `bucket`: filtro opcional por rubro interno (`bicicletas`, `bicipartes`, `mix`, `neumaticos`).
- `listType`: filtro opcional `distribuidor` o `mostrador`.
- `limit`: cantidad maxima de lineas de detalle.

## Que devuelve

- KPIs de auditoria: venta bruta, descuento comercial, descuento pronto pago, venta neta, facturas, lineas y clientes vendidos.
- Resumen por asesor, rubro interno y lista de precios.
- Lista de clientes vendidos detectados, para comparar diferencias contra Power BI.
- Detalle linea por linea con factura, asesor, cliente, producto, clasificacion, condicion de pago, subtotal, descuentos y venta neta.

## Uso recomendado

1. Elegir el mismo periodo y negocio que en Power BI.
2. Filtrar por un asesor con diferencia.
3. Exportar CSV resumen y CSV detalle.
4. Comparar contra una tabla exportada desde Power BI con las columnas:
   - Factura
   - Fecha
   - Asesor
   - Cliente
   - Producto
   - Rubro / categoria
   - Lista de precios
   - Condicion de pago
   - Subtotal producto
   - Descuento comercial
   - Descuento PP
   - Venta neta
5. Si clientes vendidos difiere, exportar CSV clientes y comparar el cliente que sobra o falta.

## Correccion tecnica adicional

Se ajusto la fuente del cliente en la query de ventas para usar `aml.partner_id`, tal como en la query original del Power BI, en lugar de `am.partner_id`.
