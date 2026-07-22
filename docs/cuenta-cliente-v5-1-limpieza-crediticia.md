# Cuenta Cliente v5.1 - Limpieza cartera y explicación crediticia

Base: versión v6.6 con Objetivos Comerciales y Cuenta Cliente v5.

## Cambios principales

### Exposición crediticia
Se aclara y renombra el concepto de exposición:

```text
Exposición crediticia = Cta Cte + Cheques + Presupuestos del mes actual
```

Los pedidos de venta que consumen crédito ahora se calculan únicamente desde `sale_order` en estado `draft` (Presupuesto) y dentro del mes calendario actual. No se incluyen presupuestos cancelados, bloqueados, pedidos confirmados, pedidos facturados ni historial completo del cliente.

### Disponible según Odoo
Se aclara el cálculo:

```text
Disponible según Odoo = Límite concedido Odoo - Exposición crediticia
```

Si el cliente no tiene límite Odoo y tiene presupuesto del mes, la pantalla lo marca como exposición sin límite para revisión.

### Disponible según score
Se aclara el cálculo:

```text
Disponible según score = Límite calculado por score - Exposición crediticia
```

### Limpieza de cartera
El filtro por defecto ahora es `Cartera comercial`, priorizando clientes con asesor asignado y nombre válido. Se agregaron filtros para revisar casos específicos:

- Todos
- Para vender
- Aptos
- Disponible score
- Revisión
- Bloqueados
- Excedidos
- Sin límite Odoo
- Exposición sin límite
- Con presupuesto mes
- Mora +30
- BCRA observados
- Sin BCRA
- Sin asesor
- Datos incompletos

### Tabla
Se agregó columna `Exposición crediticia` y se renombró `Pedidos venta` a `Presupuesto mes` para evitar confusión.

### Ajuste importante
La tabla `limite_credito`, cuando existe, ya no pisa los pedidos del mes con totales históricos de pedidos/presupuestos. Solo se usa para tomar el límite concedido. El componente de pedidos se calcula directamente desde `sale_order` según la regla vigente.

