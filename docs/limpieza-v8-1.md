# V8.1 - Limpieza funcional

Esta versión parte exclusivamente de `gestor-solicitudes-lopez-v8-estabilizacion-produccion.zip`.

## Eliminado

- CRM frontend y backend.
- Oportunidades, actividades, alertas y sincronización CRM.
- Campañas comerciales.
- Hub omnicanal y endpoint de entradas asociado.
- Presupuestos/ventas locales, productos locales y auditoría de ventas.
- Alertas automáticas de CRM y presupuestos locales.
- Estructura Next.js antigua (`frontend/app`, `frontend/components`, `frontend/lib`).
- Documentación obsoleta de los módulos eliminados.

## Conservado

- Presupuestos/pedidos provenientes de Odoo usados por Nota de Crédito.
- Pedidos del mes actual usados en Cuenta Cliente para calcular exposición crediticia.
- Pedidos y presupuestos recientes de Odoo dentro de Radiografía Comercial.

## Ajustes de orden

- La base SQLite incluida pasa de `crm.db` a `gestor.db`.
- La clave local de sesión pasa de `crm_user` a `gestor_user`.
- Se eliminó la dependencia de drag-and-drop utilizada únicamente por CRM.
