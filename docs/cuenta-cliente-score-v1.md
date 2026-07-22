# Cuenta Cliente / Score interno v1

Primera versión del módulo de cuenta cliente basado en la lógica del tablero Power BI actual.

## Lógica replicada

- Cta Cte + Cheques = saldo + cheques
- Pedidos venta = pedido confirmado + presupuesto
- Exposición total = Cta Cte + Cheques + Pedidos venta
- Límite disponible = Límite concedido - Exposición total
- % límite ocupado = Exposición total / Límite concedido

A diferencia del tablero, cuando el cliente queda excedido no se deja el porcentaje en blanco: se muestra el porcentaje ocupado real y el disponible negativo.

## Score interno inicial

El score arranca en 1000 puntos y descuenta por:

- mora máxima
- deuda vencida contra compra promedio mensual
- ocupación de límite
- cliente nuevo o sin ventas 12 meses
- CUIT / asesor faltante

Reglas base:

- mora mayor a 30 días requiere revisión de Cuentas Corrientes
- mora mayor a 60 días se considera bloqueo / solo contado
- cliente nuevo con límite superior a $1.500.000 requiere revisión
- límite excedido requiere revisión

## Backend

Nuevos endpoints:

- GET /api/credit/accounts
- GET /api/credit/accounts/:clienteId
- GET /api/credit/policy

El backend consulta Odoo por `account_move`, `sale_order`, `res_partner` y, si existen, intenta enriquecer con las tablas/vistas `limite_credito` y `cheques` usadas por el tablero.

## Frontend

Nuevo módulo en menú lateral: Cuenta Cliente.

Incluye:

- tabla general de clientes
- KPIs de cartera
- filtros por estado
- descarga CSV
- ficha del cliente
- pestañas resumen, cuenta corriente, pedidos y score
