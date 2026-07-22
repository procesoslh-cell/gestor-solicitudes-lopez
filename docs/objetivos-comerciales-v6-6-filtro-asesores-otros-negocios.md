# Objetivos Comerciales V6.6 - Filtro multi asesor y ventas fuera de negocio

## Base
Versión basada en `gestor-solicitudes-lopez-v6-5-pp-auditoria-asesor.zip`.

## Cambios

### 1. Filtro de asesores mejorado
- El filtro de asesor deja de ser un desplegable simple.
- Ahora es un selector con búsqueda y checkboxes.
- Permite seleccionar varios asesores al mismo tiempo.
- Aplica tanto al dashboard común como a la auditoría.
- El listado de asesores se obtiene desde vendedores reales con facturas en Odoo, evitando que aparezcan clientes/contacts como vendedores.

### 2. Auditoría al hacer clic en asesor
- Se mantiene el comportamiento de hacer clic sobre el nombre del asesor para abrir la auditoría filtrada.
- La auditoría permite filtrar por rubro interno, lista y ahora también por `Fuera de este negocio`.

### 3. Ventas fuera del negocio seleccionado
- El resumen ahora calcula ventas clasificadas como `otros` para el negocio seleccionado.
- Se agrega KPI `Fuera de negocio`.
- Se agrega columna `Otros negocios` en la tabla por asesor.
- Esto ayuda a explicar diferencias contra Power BI cuando ventas que el tablero anterior contempla dentro de un negocio, el nuevo sistema las clasifica correctamente en otro negocio.

## Nota funcional
Si en Power BI una venta de Ciclismo aparece dentro de MIX/Moto por la clasificación anterior, en esta versión la venta queda fuera del negocio Motociclismo y aparece en `Fuera de negocio`. Para investigarla, abrir auditoría y elegir Rubro interno = `Fuera de este negocio`.
