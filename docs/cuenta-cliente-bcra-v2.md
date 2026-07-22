# Cuenta Cliente v2 - Integracion BCRA

Esta version agrega la integracion inicial con la API publica de Central de Deudores del BCRA dentro del modulo Cuenta Cliente.

## Flujo funcional

1. El usuario entra a Cuenta Cliente.
2. Abre la ficha de un cliente.
3. En la pestana BCRA toca Consultar / actualizar BCRA.
4. El backend consulta por CUIT/CUIL/CDI:
   - /CentralDeDeudores/v1.0/Deudas/{identificacion}
   - /CentralDeDeudores/v1.0/Deudas/Historicas/{identificacion}
   - /CentralDeDeudores/v1.0/Deudas/ChequesRechazados/{identificacion}
5. El resultado se guarda localmente en SQLite para no consultar BCRA en cada refresh.
6. El score final se recalcula combinando score interno LH/Odoo + alertas BCRA.

## Datos BCRA visibles

- Situacion maxima actual.
- Deuda BCRA total estimada en pesos.
- Cantidad de entidades informantes.
- Dias maximos de atraso.
- Peor situacion historica 24 meses.
- Cheques rechazados totales.
- Cheques rechazados recientes.
- Cheques pendientes de regularizacion.
- Fecha de ultima consulta.

## Reglas iniciales de score BCRA

- Situacion 1: sin descuento.
- Situacion 2: -150 y requiere revision.
- Situacion 3: -300 y requiere revision.
- Situacion 4: -500 y bloqueo / solo contado.
- Situacion 5 o 6: -650 y bloqueo / solo contado.
- Cheque rechazado reciente: -250 y requiere revision.
- Cheque rechazado pendiente de regularizacion: -350 y bloqueo.
- CUIT invalido: -80 y requiere revision.

## Nota operativa

La consulta BCRA se realiza manualmente desde la ficha para evitar trafico innecesario contra el servicio publico. La tabla general muestra el ultimo dato consultado y marca los clientes observados.
