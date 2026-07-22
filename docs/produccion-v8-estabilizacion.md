# V8 - Estabilizacion para produccion

Base de trabajo: v7.4. Esta version no agrega modulos funcionales nuevos; endurece la base para piloto/produccion controlada.

## Backend real

El backend activo es Node/Express:

- `backend/server.js`
- `backend/src/app.js`
- `backend/src/modules/*`

La carpeta Python/FastAPI fue movida a `legacy/python-fastapi-backend` para evitar confusion al dockerizar.

## Capacidad esperada

Con esta etapa, la app queda mejor preparada para el escenario actual:

- 30 vendedores aproximadamente, con uso mayormente PWA y no todos concurrentes.
- 5 jefes/gerentes.
- 3 usuarios de Cuentas Corrientes.
- 1 admin y 1 IT.

Sigue siendo recomendable evitar consultas masivas simultaneas de Cuenta Cliente, Listas y BCRA sin cache/colas dedicadas.

## Cambios tecnicos

- Pool PostgreSQL Odoo configurable.
- Timeouts de conexion y consulta.
- Log de consultas Odoo lentas.
- Cache TTL en memoria para consultas repetidas y listas de precio.
- Health checks `/health`, `/api/health`, `/api/health/deep`.
- SQLite con WAL, busy timeout y claves foraneas.
- Indices SQLite para tablas locales frecuentes.
- Dockerfile backend.
- Dockerfile frontend con Nginx.
- docker-compose inicial.
- `.env.example` ampliado.
- Error handler centralizado.
- Apagado ordenado con SIGTERM/SIGINT.

## Proximo paso recomendado

1. Microsoft OAuth / Entra ID.
2. Roles por grupo: vendedor, supervisor, gerente, cuentas corrientes, admin, IT.
3. Filtros por rol desde backend, no solo desde frontend.
4. Migrar SQLite a PostgreSQL si el uso crece.
5. Cola para BCRA masivo, recalculo de score y generacion de listas.
