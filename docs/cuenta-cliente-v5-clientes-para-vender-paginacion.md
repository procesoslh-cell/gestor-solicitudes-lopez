# Cuenta Cliente v5 - Clientes para vender y paginación

Base validada: `gestor-solicitudes-lopez-cuenta-cliente-v4-fix-clientids`.

## Cambios incluidos

### 1. Paginación en Cuenta Cliente

La pantalla de Cuenta Cliente ahora permite trabajar por páginas en lugar de quedar atada a una carga fija de 300 clientes.

- Selector de cantidad por página: 100, 300, 500 o 1000.
- Botones: página anterior, página siguiente y cargar más.
- El backend acepta `page`, `limit` y `offset` en `/api/credit/accounts`.
- La respuesta incluye metadata de paginación: página, límite, offset, cantidad visible, total base y si hay más registros.

### 2. Clientes para vender

Se agregó una nueva vista de menú: **Clientes para vender**.

Esta vista reutiliza el motor de Cuenta Cliente, pero inicia filtrada por clientes accionables comercialmente. El objetivo es que cada asesor/supervisor vea a quién puede vender o reactivar durante el mes.

### 3. Acción sugerida comercial

Cada cuenta ahora devuelve:

- `accion_sugerida`
- `prioridad_comercial`
- `motivo_accion`
- `apto_para_vender`

Acciones posibles iniciales:

- Vender con cuenta corriente
- Vender dentro de límite Odoo
- Reactivar / agregar a gira
- Gestionar cobranza
- Solicitar revisión CC
- Revisar BCRA
- Solo contado / regularizar
- Sin acción comercial

### 4. Nuevos filtros

En Cuenta Cliente se agregaron filtros:

- Para vender
- Disponible score
- BCRA observados
- Sin BCRA

Además de los anteriores: Todos, Aptos, Revisión, Bloqueados, Excedidos y Mora +30.

### 5. Consulta masiva BCRA mejorada

La consulta masiva BCRA ahora guarda un historial técnico en SQLite.

Tabla nueva:

- `bcra_bulk_runs`

Campos principales:

- usuario que ejecutó
- filtros usados
- total
- consultados
- omitidos
- CUIT inválidos
- errores
- observados
- fecha inicio / fin

Endpoint nuevo:

- `GET /api/credit/bcra/bulk/history`

## Recomendación de uso

- Cuenta Cliente: vista general de cartera y riesgo.
- Clientes para vender: vista operativa para accionar comercialmente.
- Consulta masiva BCRA: correr por lotes una vez al mes o antes de una campaña importante.
