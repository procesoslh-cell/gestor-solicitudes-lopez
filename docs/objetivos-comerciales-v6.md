# V6 - Objetivos Comerciales

Base: `gestor-solicitudes-lopez-cuenta-cliente-v5-fix-parametros`.

## Objetivo

Reconstruir dentro de la aplicación la tabla principal del tablero Power BI de vendedores para Ciclismo y Motociclismo, de forma que los asesores, supervisores, jefes y gerencia puedan ver el avance mensual sin depender del tablero externo.

## Nuevo módulo

- Menú lateral: **Objetivos comerciales**.
- Para rol vendedor se muestra como **Mi objetivo**.
- Pestañas: **Ciclismo** y **Motociclismo**.

## Indicadores incluidos

- Venta neta.
- Objetivo.
- Porcentaje de cumplimiento.
- A facturar / confirmado.
- Proyectado.
- Porcentaje proyectado.
- Clientes.
- Ranking de asesores.

## Tabla por vendedor

### Ciclismo

- Asesor.
- Venta / objetivo / cumplimiento de Bicicletas.
- Venta / objetivo / cumplimiento de Bicipartes.
- Objetivo asesor total.
- Venta neta total.
- A facturar.
- Proyectado.
- % cumplimiento.
- % proyectado.
- Clientes.
- Estado.

### Motociclismo

- Asesor.
- Venta / objetivo / cumplimiento de MIX.
- Venta / objetivo / cumplimiento de Neumáticos.
- Objetivo asesor total.
- Venta neta total.
- A facturar.
- Proyectado.
- % cumplimiento.
- % proyectado.
- Clientes.
- Estado.

## Carga de objetivos

Roles habilitados:

- admin
- supervisor
- gerente
- jefe

Funciones:

- Cargar objetivo mensual por asesor y rubro.
- Copiar objetivos del mes anterior.
- Agregar asesor a la grilla.
- Guardar objetivos en SQLite local.
- Exportar CSV del seguimiento.

## Backend agregado

Archivo nuevo:

- `backend/src/modules/commercial-objectives.routes.js`

Endpoints:

- `GET /api/commercial-objectives/summary`
- `GET /api/commercial-objectives/objectives`
- `POST /api/commercial-objectives/objectives`
- `POST /api/commercial-objectives/copy-previous`
- `GET /api/commercial-objectives/advisors`

Tabla nueva:

- `commercial_objectives`

## Criterios iniciales de cálculo

- Venta real: facturas publicadas de Odoo (`account_move` + `account_move_line`).
- Se consideran facturas y notas de crédito.
- Objetivo: cargado en el sistema por supervisor/jefe.
- Proyectado: venta neta + a facturar.
- A facturar: pedidos confirmados/pendientes de facturación desde Odoo.

## Nota de comparación contra Power BI

Esta V6 está preparada para validar contra las pestañas Ciclismo y Motociclismo del Power BI. La clasificación por rubro se hace inicialmente por categoría/producto de Odoo. Si alguna diferencia aparece contra el tablero, se debe ajustar el mapeo de rubros/listas de precio según las reglas exactas del modelo Power BI.
