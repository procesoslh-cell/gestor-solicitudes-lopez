import { useEffect, useMemo, useState } from "react";
import TripDetail from "./TripDetail";
import TripMap from "./TripMap";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function readDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("es-AR");
  } catch {
    return value;
  }
}

function formatKm(value) {
  const numberValue = Number(value || 0);
  return `${numberValue.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

function getTripOperationalStatus(trip) {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = readDate(trip.start_date);
  const endDate = readDate(trip.end_date);

  if (trip.supervisor_status === "Aprobada" || trip.status === "Cerrada") {
    return {
      label: "Cerrada",
      className: "status-approved",
      detail: "Revisión supervisor finalizada",
    };
  }

  if (trip.supervisor_status === "Devuelta") {
    return {
      label: "Devuelta",
      className: "status-warning-badge",
      detail: "Requiere corrección del asesor",
    };
  }

  if (trip.closed_at || trip.status === "Pendiente revisión") {
    return {
      label: "En revisión",
      className: "status-warning-badge",
      detail: "Pendiente control supervisor",
    };
  }

  if (startDate) startDate.setHours(0, 0, 0, 0);
  if (endDate) endDate.setHours(0, 0, 0, 0);

  if (startDate && today < startDate) {
    return {
      label: "Planificada",
      className: "status-pending",
      detail: `Inicia ${formatDate(trip.start_date)}`,
    };
  }

  if (startDate && endDate && today >= startDate && today <= endDate) {
    return {
      label: "En proceso",
      className: "status-warning-badge",
      detail: `Finaliza ${formatDate(trip.end_date)}`,
    };
  }

  if (endDate && today > endDate) {
    const dueAt = new Date(endDate);
    dueAt.setDate(dueAt.getDate() + 3);
    dueAt.setHours(23, 59, 59, 999);

    const diffHours = Math.ceil((dueAt.getTime() - now.getTime()) / 1000 / 60 / 60);

    if (diffHours >= 0) {
      return {
        label: "Pendiente devolución",
        className: diffHours <= 24 ? "status-warning-badge" : "status-pending",
        detail: `Vence cierre en ${diffHours}hs`,
      };
    }

    return {
      label: "Vencida",
      className: "status-rejected",
      detail: `Vencida hace ${Math.abs(diffHours)}hs`,
    };
  }

  return {
    label: trip.status || "Planificada",
    className: "status-pending",
    detail: "Sin fechas configuradas",
  };
}

export default function Trips({ user }) {
  const [trips, setTrips] = useState([]);
  const [asesores, setAsesores] = useState([]);
  const [clients, setClients] = useState([]);

  const [selectedTripId, setSelectedTripId] = useState(null);
  const [activeTripId, setActiveTripId] = useState(null);
  const [previewTrip, setPreviewTrip] = useState(null);
  const [previewClients, setPreviewClients] = useState([]);
  const [previewSummary, setPreviewSummary] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [geocodingPreview, setGeocodingPreview] = useState(false);

  const [selectedAsesor, setSelectedAsesor] = useState("");
  const [selectedAsesorName, setSelectedAsesorName] = useState("");
  const [nombre, setNombre] = useState("");
  const [mes, setMes] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedClients, setSelectedClients] = useState([]);

  const [loadingClients, setLoadingClients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [onlyInactive, setOnlyInactive] = useState(false);

  const [tripSearch, setTripSearch] = useState("");
  const [tripStatusFilter, setTripStatusFilter] = useState("Todos");
  const [tripAsesorFilter, setTripAsesorFilter] = useState("Todos");
  const [showPlanner, setShowPlanner] = useState(false);

  const isSeller = user?.role === "vendedor";

  useEffect(() => {
    loadTrips();

    if (!isSeller) {
      loadAsesores();
    } else if (user?.odoo_user_id) {
      setSelectedAsesor(String(user.odoo_user_id));
      setSelectedAsesorName(user.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTripId) {
      loadTripPreview(activeTripId);
    } else {
      setPreviewTrip(null);
      setPreviewClients([]);
      setPreviewSummary(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTripId]);

  async function readJson(response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error("El servidor devolvió una respuesta inválida.");
    }
  }

  async function loadTrips() {
    try {
      const params = new URLSearchParams();
      params.append("role", user?.role || "");

      if (isSeller) {
        params.append("odooUserId", user?.odoo_user_id || "");
      }

      const response = await fetch(`${API_URL}/api/trips?${params.toString()}`);
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudieron cargar giras.");
      }

      const nextTrips = Array.isArray(data) ? data : [];
      setTrips(nextTrips);

      if (!activeTripId && nextTrips.length > 0) {
        setActiveTripId(nextTrips[0].id);
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudieron cargar las giras.");
      setTrips([]);
    }
  }

  async function loadTripPreview(tripId) {
    try {
      setLoadingPreview(true);

      const response = await fetch(`${API_URL}/api/trips/${tripId}`);
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cargar el mapa de la gira.");
      }

      setPreviewTrip(data.trip || null);
      setPreviewClients(Array.isArray(data.clients) ? data.clients : []);
      setPreviewSummary(data.route_summary || null);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo cargar el mapa de la gira.");
      setPreviewTrip(null);
      setPreviewClients([]);
      setPreviewSummary(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function geocodeActiveTrip() {
    if (!activeTripId) {
      setMessage("Seleccioná una gira primero.");
      return;
    }

    try {
      setGeocodingPreview(true);
      setMessage("Buscando direcciones en Odoo y estimando coordenadas...");

      const response = await fetch(`${API_URL}/api/trips/${activeTripId}/geocode-clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 25 }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudieron estimar coordenadas.");
      }

      setPreviewClients(Array.isArray(data.clients) ? data.clients : []);
      setPreviewSummary(data.route_summary || null);

      await loadTrips();
      await loadTripPreview(activeTripId);

      setMessage(
        data.updated > 0
          ? `Coordenadas estimadas: ${data.updated}. Clientes sin ubicar: ${data.failed}.`
          : "No se pudieron estimar coordenadas nuevas. Revisá si los clientes tienen dirección/localidad en Odoo."
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Error estimando coordenadas.");
    } finally {
      setGeocodingPreview(false);
    }
  }

  async function loadAsesores() {
    try {
      const response = await fetch(`${API_URL}/api/odoo/asesores`);
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudieron cargar asesores.");
      }

      setAsesores(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setAsesores([]);
      setMessage(error.message || "No se pudieron cargar asesores.");
    }
  }

  async function loadClients() {
    if (isSeller && !user?.odoo_user_id) {
      setMessage("Tu usuario no tiene vendedor Odoo vinculado.");
      return;
    }

    if (!isSeller && !selectedAsesor) {
      setMessage("Seleccioná un asesor primero.");
      return;
    }

    try {
      setLoadingClients(true);
      setMessage("");

      const params = new URLSearchParams();
      params.append("role", user?.role || "");

      if (isSeller) {
        params.append("odooUserId", user.odoo_user_id);
      } else {
        params.append("asesorId", selectedAsesor);
      }

      const response = await fetch(
        `${API_URL}/api/comercial/radiografia?${params.toString()}`
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cargar la cartera.");
      }

      setClients(Array.isArray(data?.data) ? data.data : []);
      setSelectedClients([]);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo cargar la cartera.");
    } finally {
      setLoadingClients(false);
    }
  }

  function toggleClient(client) {
    const exists = selectedClients.some(
      (item) => item.cliente_id === client.cliente_id
    );

    if (exists) {
      setSelectedClients((prev) =>
        prev.filter((item) => item.cliente_id !== client.cliente_id)
      );
    } else {
      setSelectedClients((prev) => [...prev, client]);
    }
  }

  function selectSuggested() {
    const suggested = clients.filter((client) => client.estado === "Inactivo");
    setSelectedClients(suggested);
  }

  async function createTrip() {
    const finalAsesorId = isSeller ? user?.odoo_user_id : selectedAsesor;
    const finalAsesorName = isSeller ? user?.name : selectedAsesorName;

    if (!finalAsesorId || !nombre || !mes || !startDate || !endDate) {
      setMessage("Completá asesor, nombre, mes, fecha de inicio y fecha de fin.");
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      setMessage("La fecha de fin no puede ser anterior a la fecha de inicio.");
      return;
    }

    if (selectedClients.length === 0) {
      setMessage("Seleccioná clientes.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(`${API_URL}/api/trips`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asesor_id: Number(finalAsesorId),
          asesor: finalAsesorName,
          nombre,
          mes,
          observaciones,
          start_date: startDate,
          end_date: endDate,
          clientes: selectedClients,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo crear la gira.");
      }

      setMessage("Gira creada correctamente.");
      setNombre("");
      setMes("");
      setStartDate("");
      setEndDate("");
      setObservaciones("");
      setClients([]);
      setSelectedClients([]);
      setShowPlanner(false);

      await loadTrips();
      if (data?.tripId) setActiveTripId(data.tripId);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Error creando gira.");
    } finally {
      setSaving(false);
    }
  }

  const filteredClients = useMemo(() => {
    let data = Array.isArray(clients) ? [...clients] : [];

    if (onlyInactive) {
      data = data.filter((client) => client.estado === "Inactivo");
    }

    if (search) {
      const value = search.toLowerCase();

      data = data.filter((client) => {
        return (
          (client.cliente || "").toLowerCase().includes(value) ||
          (client.estado || "").toLowerCase().includes(value)
        );
      });
    }

    return data;
  }, [clients, search, onlyInactive]);

  const inactiveCount = clients.filter(
    (client) => client.estado === "Inactivo"
  ).length;

  const pendingClosureCount = trips.filter((trip) => {
    const status = getTripOperationalStatus(trip);
    return ["Pendiente devolución", "Vencida"].includes(status.label);
  }).length;

  const asesorOptions = useMemo(() => {
    const names = new Set();
    trips.forEach((trip) => {
      if (trip.asesor) names.add(trip.asesor);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [trips]);

  const filteredTrips = useMemo(() => {
    const value = tripSearch.toLowerCase().trim();

    return trips.filter((trip) => {
      const status = getTripOperationalStatus(trip);
      const matchesSearch =
        !value ||
        (trip.nombre || "").toLowerCase().includes(value) ||
        (trip.asesor || "").toLowerCase().includes(value) ||
        (trip.mes || "").toLowerCase().includes(value);

      const matchesStatus =
        tripStatusFilter === "Todos" || status.label === tripStatusFilter;

      const matchesAsesor =
        tripAsesorFilter === "Todos" || trip.asesor === tripAsesorFilter;

      return matchesSearch && matchesStatus && matchesAsesor;
    });
  }, [trips, tripSearch, tripStatusFilter, tripAsesorFilter]);

  const activeTrip = useMemo(() => {
    return trips.find((trip) => String(trip.id) === String(activeTripId)) || null;
  }, [trips, activeTripId]);

  const previewVisited = previewClients.filter(
    (client) => client.visit_status === "Visitado"
  ).length;

  const previewPending = previewClients.length - previewVisited;

  const previewRouteStart = useMemo(
    () => ({
      name: previewTrip?.route_start_name || "Punto de salida",
      lat: previewTrip?.route_start_lat || "",
      lng: previewTrip?.route_start_lng || "",
    }),
    [previewTrip]
  );

  const returnToStart = previewTrip?.route_return_to_start === 0 ? false : true;

  return (
    <div className="trips-page route-command-page">
      <div className="radiography-header route-command-header">
        <div>
          <p className="eyebrow">Centro de ruteo comercial</p>
          <h1>Planificación de Giras</h1>

          <p>
            {isSeller
              ? "Visualizá tu recorrido, seguí los puntos asignados y registrá cada visita con ubicación."
              : "Planificá giras, ubicá clientes por dirección de Odoo y controlá el recorrido de vendedores viajantes."}
          </p>
        </div>

        <button className="primary-button" onClick={() => setShowPlanner(!showPlanner)}>
          {showPlanner ? "Cerrar nueva gira" : "+ Nueva gira"}
        </button>
      </div>

      {message && <div className="radiography-error">{message}</div>}

      <section className="route-control-hero">
        <div className="route-control-toolbar">
          <div>
            <h2>Mapa de seguimiento</h2>
            <p>Elegí una gira para ver clientes, orden de visita, kilómetros y avance.</p>
          </div>

          <div className="route-filters">
            <input
              className="search-input"
              placeholder="Buscar gira o asesor..."
              value={tripSearch}
              onChange={(event) => setTripSearch(event.target.value)}
            />

            <select
              className="status-filter"
              value={tripStatusFilter}
              onChange={(event) => setTripStatusFilter(event.target.value)}
            >
              <option>Todos</option>
              <option>Planificada</option>
              <option>En proceso</option>
              <option>Pendiente devolución</option>
              <option>Vencida</option>
              <option>En revisión</option>
              <option>Cerrada</option>
              <option>Devuelta</option>
            </select>

            {!isSeller && (
              <select
                className="status-filter"
                value={tripAsesorFilter}
                onChange={(event) => setTripAsesorFilter(event.target.value)}
              >
                <option>Todos</option>
                {asesorOptions.map((asesor) => (
                  <option key={asesor} value={asesor}>
                    {asesor}
                  </option>
                ))}
              </select>
            )}

            <button className="secondary-button" onClick={loadTrips}>
              Actualizar
            </button>
          </div>
        </div>

        <div className="route-kpi-strip">
          <div>
            <span>Giras visibles</span>
            <strong>{filteredTrips.length}</strong>
          </div>
          <div>
            <span>Clientes ruta</span>
            <strong>{previewClients.length}</strong>
          </div>
          <div>
            <span>Visitados</span>
            <strong>{previewVisited}</strong>
          </div>
          <div>
            <span>Pendientes</span>
            <strong>{previewPending}</strong>
          </div>
          <div>
            <span>Km estimados</span>
            <strong>{formatKm(previewSummary?.total_km || previewTrip?.route_total_km || 0)}</strong>
          </div>
          <div>
            <span>SLA pendientes</span>
            <strong>{pendingClosureCount}</strong>
          </div>
        </div>

        <div className="route-command-grid">
          <div className="route-map-stage">
            <div className="route-map-titlebar">
              <div>
                <span>{activeTrip ? getTripOperationalStatus(activeTrip).label : "Sin gira seleccionada"}</span>
                <h3>{activeTrip?.nombre || "Seleccioná una gira para visualizar el recorrido"}</h3>
                <p>
                  {activeTrip
                    ? `${activeTrip.asesor} · ${formatDate(activeTrip.start_date)} → ${formatDate(activeTrip.end_date)}`
                    : "El mapa usa coordenadas cargadas o estimadas desde dirección."}
                </p>
              </div>

              {activeTrip && (
                <div className="route-map-actions">
                  <button
                    className="secondary-button"
                    onClick={geocodeActiveTrip}
                    disabled={geocodingPreview}
                  >
                    {geocodingPreview ? "Estimando..." : "Estimar coordenadas"}
                  </button>

                  <button
                    className="primary-button"
                    onClick={() => setSelectedTripId(activeTrip.id)}
                  >
                    Ver / editar gira
                  </button>
                </div>
              )}
            </div>

            <div className="route-map-canvas">
              {loadingPreview ? (
                <div className="trip-map-empty">Cargando mapa...</div>
              ) : (
                <TripMap
                  clients={previewClients}
                  routeStart={previewRouteStart}
                  returnToStart={returnToStart}
                />
              )}
            </div>
          </div>

          <aside className="route-side-panel">
            <div className="route-side-title">
              <h3>Giras</h3>
              <span>{filteredTrips.length} resultado(s)</span>
            </div>

            <div className="route-trip-list">
              {filteredTrips.length === 0 ? (
                <div className="empty-box">No hay giras para los filtros seleccionados.</div>
              ) : (
                filteredTrips.map((trip) => {
                  const operationalStatus = getTripOperationalStatus(trip);
                  const isActive = String(activeTripId) === String(trip.id);

                  return (
                    <button
                      type="button"
                      className={`route-trip-card ${isActive ? "active" : ""}`}
                      key={trip.id}
                      onClick={() => setActiveTripId(trip.id)}
                    >
                      <div>
                        <strong>{trip.nombre}</strong>
                        <span>{trip.asesor}</span>
                        <small>{formatDate(trip.start_date)} → {formatDate(trip.end_date)}</small>
                        <small>{operationalStatus.detail}</small>
                      </div>

                      <div className="route-trip-card-right">
                        <span className={`trip-status ${operationalStatus.className}`}>
                          {operationalStatus.label}
                        </span>
                        <b>{formatKm(trip.route_total_km || 0)}</b>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      </section>

      {showPlanner && (
        <section className="trip-form-card trip-planner-card">
          <div className="trip-header">
            <div>
              <h2>Nueva gira</h2>

              <p>
                {isSeller
                  ? "Cargá tu cartera, definí fechas y armá la gira comercial."
                  : "Seleccioná asesor, definí fechas y armá la gira comercial."}
              </p>
            </div>
          </div>

          <div className="trip-form-grid">
            {!isSeller && (
              <select
                className="status-filter"
                value={selectedAsesor}
                onChange={(event) => {
                  const id = event.target.value;

                  const asesor = asesores.find(
                    (item) => String(item.asesor_id) === String(id)
                  );

                  setSelectedAsesor(id);
                  setSelectedAsesorName(asesor?.asesor || "");
                  setClients([]);
                  setSelectedClients([]);
                }}
              >
                <option value="">Seleccionar asesor</option>

                {asesores.map((asesor) => (
                  <option key={asesor.asesor_id} value={asesor.asesor_id}>
                    {asesor.asesor}
                  </option>
                ))}
              </select>
            )}

            {isSeller && (
              <input
                className="search-input"
                value={user?.name || ""}
                readOnly
                title="Vendedor vinculado"
              />
            )}

            <input
              className="search-input"
              type="text"
              placeholder="Nombre de gira"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
            />

            <input
              className="search-input"
              type="month"
              value={mes}
              onChange={(event) => setMes(event.target.value)}
            />

            <input
              className="search-input"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              title="Fecha de inicio"
            />

            <input
              className="search-input"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              title="Fecha de fin"
            />

            <button className="primary-button" onClick={loadClients}>
              {loadingClients ? "Cargando..." : "Cargar cartera"}
            </button>
          </div>

          <textarea
            className="trip-textarea"
            placeholder="Objetivos y observaciones..."
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
          />

          <div className="radiography-stats planner-stats">
            <div className="stat-card">
              <span>Cartera cargada</span>
              <strong>{clients.length}</strong>
            </div>

            <div className="stat-card">
              <span>Clientes inactivos</span>
              <strong>{inactiveCount}</strong>
            </div>

            <div className="stat-card">
              <span>Clientes seleccionados</span>
              <strong>{selectedClients.length}</strong>
            </div>
          </div>

          {clients.length > 0 && (
            <>
              <div className="trip-toolbar">
                <div className="trip-toolbar-left">
                  <input
                    className="search-input"
                    placeholder="Buscar cliente..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />

                  <label className="trip-checkbox">
                    <input
                      type="checkbox"
                      checked={onlyInactive}
                      onChange={() => setOnlyInactive(!onlyInactive)}
                    />

                    Solo inactivos
                  </label>
                </div>

                <div className="trip-toolbar-right">
                  <div className="trip-selected-counter">
                    {selectedClients.length} seleccionados
                  </div>

                  <button
                    className="secondary-button suggested-button"
                    onClick={selectSuggested}
                  >
                    Seleccionar sugeridos
                  </button>
                </div>
              </div>

              <div className="trip-client-list">
                {filteredClients.map((client) => {
                  const checked = selectedClients.some(
                    (item) => item.cliente_id === client.cliente_id
                  );

                  return (
                    <label
                      className={`trip-client-row ${checked ? "selected" : ""}`}
                      key={client.cliente_id}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleClient(client)}
                      />

                      <div className="trip-client-info">
                        <strong>{client.cliente}</strong>
                        <span>{client.asesor}</span>
                        <span>
                          {[client.direccion, client.localidad, client.provincia]
                            .filter(Boolean)
                            .join(" · ") || "Sin dirección cargada"}
                        </span>
                      </div>

                      <span
                        className={
                          client.estado === "Activo"
                            ? "status-active"
                            : "status-inactive"
                        }
                      >
                        {client.estado}
                      </span>
                    </label>
                  );
                })}
              </div>

              <button
                className="primary-button trip-save-button"
                onClick={createTrip}
                disabled={saving}
              >
                {saving ? "Guardando..." : "Crear gira"}
              </button>
            </>
          )}
        </section>
      )}

      {selectedTripId && (
        <TripDetail
          tripId={selectedTripId}
          user={user}
          onClose={() => setSelectedTripId(null)}
          onRefresh={async () => {
            await loadTrips();
            if (activeTripId) await loadTripPreview(activeTripId);
          }}
        />
      )}
    </div>
  );
}
