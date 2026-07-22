# Liquidación de Comisiones V8.9

## Alcance inicial

El módulo incorpora un circuito completo de preliquidación mensual:

1. Supervisor o Jefe configura y activa un esquema comisional.
2. El sistema toma los resultados de Objetivos Comerciales.
3. Calcula ventas por canal/rubro, alcance, clientes y cobranzas validadas.
4. Comercial revisa, agrega ajustes auditados y envía a RRHH.
5. RRHH aprueba, devuelve o rechaza con observaciones.
6. Gerencia puede consultar todas las liquidaciones y su trazabilidad.

## Esquemas

Los esquemas son versionados y tienen vigencia mensual. Una versión activa no se edita; para cambiarla se crea una nueva versión.

Reglas configurables:

- Venta Mostrador y Distribuidor por rubro.
- Escalas de comisión por alcance de objetivo.
- Comisión por medio de cobranza.
- Premio fijo por cantidad de clientes vendidos.
- Multiplicadores por alcance total o por clientes.
- Porcentaje de penalización de referencia.

Se incluyen dos modelos iniciales en borrador, basados en las planillas compartidas de Ciclismo y Motociclismo. Deben revisarse y activarse antes de calcular.

## Fuentes

- Ventas, objetivos, clientes y alcance: módulo Objetivos Comerciales / réplica Odoo.
- Facturas de auditoría: consulta de auditoría de Objetivos Comerciales.
- Cobranzas: registros del módulo Cobranzas con estado `Validada`, agrupados por fecha de validación.

## Estados

- Borrador.
- Enviada a RRHH.
- Devuelta.
- Aprobada.
- Rechazada.

Las liquidaciones aprobadas y rechazadas quedan bloqueadas. Las devueltas pueden corregirse y reenviarse.

## Auditoría

Los componentes se muestran redondeados a dos decimales, pero el total final se calcula con la precisión completa y se redondea al cierre, igual que las planillas actuales.

Cada liquidación conserva:

- Versión del esquema utilizado.
- Componentes del cálculo.
- Ajustes manuales positivos o negativos.
- Historial de estados y usuarios.
- Fotografía de facturas y cobranzas al enviarse a RRHH.
- Observaciones de devolución o rechazo.

## Roles

- Supervisor/Jefe: configura, calcula, ajusta y envía.
- Gerente: consulta completa de solo lectura.
- RRHH: aprueba, devuelve o rechaza.
- Administrador: acceso total.

## Pendientes posteriores

- Reemplazar cobranzas locales por pagos/conciliaciones definitivas de Odoo si se define esa fuente.
- Exportación con formato oficial de nómina para RRHH.
- Cálculo masivo mediante cola/worker cuando se migre la arquitectura.
- Autenticación Microsoft y permisos de backend basados en sesión real.
