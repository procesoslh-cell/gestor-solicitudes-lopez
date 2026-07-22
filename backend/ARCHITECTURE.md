# Gestor de Solicitudes López - Arquitectura modular

El backend activo está implementado en **Node.js + Express** y separado por dominios funcionales.

## Estructura

```txt
backend/
  server.js              # Arranque HTTP
  src/
    app.js               # Configura Express y registra módulos
    core/context.js      # Dependencias compartidas del MVP
    db/
      index.js           # Conexión SQLite actual
      schema.js          # Inicialización y migraciones simples
    modules/
      auth/
      users/
      requests/
      collections/
      credit/
      odoo/
      dashboard/
      trips/
      notifications/
      email/
      price-lists/
```

## Alcance actual

La aplicación concentra solicitudes comerciales, radiografía de clientes, cobranzas, cuenta cliente y score, objetivos, listas de precios y giras comerciales.

No forman parte de esta aplicación los módulos CRM, campañas, omnicanalidad ni presupuestos/ventas locales. Los pedidos y presupuestos consultados desde Odoo se mantienen únicamente donde son necesarios para solicitudes y exposición crediticia.

## Roadmap técnico recomendado

1. Migrar SQLite a PostgreSQL.
2. Incorporar migraciones formales.
3. Reemplazar contraseñas en texto plano por hash seguro.
4. Agregar Microsoft Entra ID, sesiones y permisos por rol en backend.
5. Separar la capa ERP mediante servicios y adaptadores Odoo/NetSuite.
6. Agregar logging estructurado, monitoreo y ambientes dev/test/prod.
7. Documentar la API con OpenAPI.
