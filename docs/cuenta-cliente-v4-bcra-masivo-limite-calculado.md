# Cuenta Cliente v4 - BCRA masivo y límite calculado

## Base

Esta versión parte de `gestor-solicitudes-lopez-cuenta-cliente-v3-score-config.zip`.

## Cambios incluidos

### Consulta masiva BCRA

Se agrega un botón en Cuenta Cliente:

- `Consulta masiva BCRA`

Uso previsto: actualización mensual de la cartera. El proceso toma los clientes visibles en la tabla, consulta la API pública de BCRA por CUIT/CUIL/CDI y guarda una copia local en SQLite.

Reglas del proceso:

- No vuelve a consultar clientes con consulta vigente según `Vigencia de consulta BCRA en días` de Configuración Score.
- Registra CUIT inválidos.
- Registra errores de API por cliente.
- Devuelve resumen de consultados, omitidos, inválidos, errores y observados.
- Usa consulta secuencial con pausa configurable por variable `BCRA_BULK_DELAY_MS` para no saturar la API.

Endpoint agregado:

```http
POST /api/credit/bcra/bulk
```

### Límite calculado automático

Se agrega configuración editable en `Configuración Score` para calcular un límite comercial sugerido desde el historial de compra.

Configuración incluida:

- Activar/desactivar límite calculado.
- Cantidad de últimas facturas a promediar.
- Mínimo de facturas requeridas.
- Multiplicador del promedio.
- Score mínimo para habilitar.
- Tope para cliente nuevo.
- Redondeo.
- Permitir o no clientes que requieren revisión.
- Exigir o no BCRA OK.

Lógica base:

```text
Promedio últimas N facturas = promedio de las últimas facturas posted de Odoo
Límite calculado = promedio últimas N facturas × multiplicador
Monto disponible score = límite calculado - exposición total
Exposición total = Cta Cte + Cheques + Pedidos venta
```

Si el cliente no cumple reglas de score, revisión, bloqueo, BCRA o facturas mínimas, el monto disponible por score queda en cero y se informa el motivo.

### Tabla Cuenta Cliente

Se agregan columnas y métricas:

- `Disponible Odoo`
- `Monto disponible score`
- `Límite calculado`
- `Promedio últimas facturas`
- Motivo de habilitación/no habilitación

### Ficha Cuenta Cliente

En el resumen de la ficha se agrega:

- Promedio últimas facturas
- Cantidad de facturas usadas
- Límite calculado
- Monto disponible score
- Motivo de cálculo

## Validaciones técnicas

- `node --check backend/src/modules/credit/credit.routes.js`
- `npm run build` del frontend OK
