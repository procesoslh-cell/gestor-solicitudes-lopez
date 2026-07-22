# Giras comerciales - Etapa 3: PWA vendedor y seguimiento

## Objetivo
Convertir el módulo de giras en una herramienta operativa para vendedores viajantes y una torre de control para supervisores, gerencia y dirección.

## Vista vendedor: Mi gira
Nueva vista pensada para uso desde celular/PWA.

Incluye:
- Selección de gira asignada al asesor.
- KPIs de avance: visitados, pendientes, en visita y km planificados.
- Mapa de la ruta con puntos numerados.
- Botón para iniciar gira con ubicación GPS.
- Botón para reportar ubicación manual.
- Apertura del cliente en Google Maps.
- Inicio de visita con GPS y cálculo de distancia al punto del cliente.
- Finalización de visita con resultado, observaciones, GPS y foto/evidencia opcional.
- Timeline de eventos registrados.

## Vista supervisor / gerente / dueño: Seguimiento de giras
Nueva vista de mapa nacional para visualizar cobertura y avance.

Incluye:
- Filtros por asesor, estado y búsqueda general.
- Mapa con rutas planificadas, puntos visitados, pendientes y última ubicación del vendedor.
- KPIs: asesores con gira, giras visibles, en curso, clientes visitados, km planificados y giras con última ubicación.
- Panel lateral con avance por asesor/gira.

## Backend agregado
Nuevos campos:
- trips.started_at
- trips.finished_at
- trip_clients.visit_started_at
- trip_clients.visit_start_lat
- trip_clients.visit_start_lng
- trip_clients.visit_result
- trip_clients.visit_photo_url
- trip_clients.visit_distance_meters

Nueva tabla:
- trip_tracking

Nuevos endpoints:
- GET /api/trips/tracking/overview
- POST /api/trips/:id/start
- POST /api/trips/:id/finish
- POST /api/trips/:id/location
- POST /api/trips/:id/clients/:clientRowId/start-visit
- POST /api/trips/:id/clients/:clientRowId/finish-visit
