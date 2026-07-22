# Cuenta Cliente v3 - Configuración de Score

Base estable: `gestor-solicitudes-lopez-cuenta-cliente-v2-bcra.zip`.

## Objetivo

Permitir que Cuentas Corrientes, Gerencia o Administración ajusten la política de score crediticio sin tocar código.

## Nuevo módulo

Menú lateral: **Configuración Score**.

Roles con edición:

- admin
- cuentas
- gerente
- jefe

Otros roles pueden quedar con acceso de lectura si se habilita desde navegación.

## Configurable desde pantalla

- Nombre y descripción de política.
- Score base.
- Matriz de decisión por rango de score.
- Reglas de mora interna.
- Reglas de deuda vencida versus compra promedio mensual.
- Reglas de ocupación de límite.
- Cliente nuevo o sin ventas.
- Datos incompletos: sin CUIT / sin asesor.
- Penalizaciones BCRA por situación 2, 3, 4, 5 y 6.
- Penalizaciones por histórico BCRA observado.
- Penalizaciones por cheques rechazados recientes.
- Penalizaciones por cheques rechazados pendientes de regularización.
- Regla de CUIT inválido.

## Versionado

Cada vez que se guarda una política, el sistema crea una nueva versión activa y conserva las anteriores.
Desde la pantalla se puede ver el historial y reactivar una política anterior.

## Backend

Nuevos endpoints:

- `GET /api/credit/score-config`
- `GET /api/credit/score-config/history`
- `PUT /api/credit/score-config`
- `POST /api/credit/score-config/reset`
- `POST /api/credit/score-config/:id/activate`

El cálculo de Cuenta Cliente ahora toma la política activa desde `credit_score_policies`.
Si no existe una política activa, el backend crea automáticamente la política base LH Score v1.

## Nota

La consulta BCRA sigue funcionando como en v2. La política configurable modifica cómo impactan esos datos en el score final y en las reglas de revisión/bloqueo.
