# Objetivos Comerciales V6.5 - Pronto Pago y auditoría por asesor

Base: V6.4 Auditoría Power BI/Odoo.

## Cambios incluidos

- Corrección de cuentas contables para descuento de pronto pago:
  - Antes se usaban incorrectamente las cuentas `865, 427`.
  - Ahora se usan las cuentas correctas `926, 1318`.
- El cálculo de venta neta del módulo Objetivos Comerciales queda:
  - Venta neta = subtotal producto + descuento comercial + descuento pronto pago.
  - Descuento comercial: cuentas `980, 1162, 1839, 1858`.
  - Descuento pronto pago: cuentas `926, 1318`.
- El filtro de asesor ahora es desplegable en el dashboard normal.
- El filtro de asesor también está disponible dentro de la auditoría.
- Al hacer clic en el nombre del asesor dentro de la tabla principal, se abre la auditoría del mes/unidad actual ya filtrada por ese asesor.
- La auditoría mantiene exportación CSV de resumen, clientes y detalle de líneas.

## Uso recomendado para conciliación

1. Seleccionar período y negocio: Ciclismo o Motociclismo.
2. Hacer clic sobre el nombre del asesor en la tabla de seguimiento.
3. Revisar KPIs de auditoría:
   - Venta bruta.
   - Descuento comercial.
   - Descuento pronto pago.
   - Venta neta.
   - Facturas/líneas.
   - Clientes vendidos.
4. Exportar `CSV detalle` para comparar contra la tabla Venta de Mercadería del Power BI.

## Validaciones realizadas

- Sintaxis backend `commercial-objectives.routes.js` OK.
- Build frontend validado con Vite directo (`node node_modules/vite/bin/vite.js build`).
