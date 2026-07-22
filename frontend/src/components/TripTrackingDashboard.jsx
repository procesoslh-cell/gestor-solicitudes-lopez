import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function readNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function isValidCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
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

function markerIcon(label, type = "advisor") {
  return L.divIcon({
    className: `tracking-marker ${type}`,
    html: `<span>${String(label || "?").slice(0, 3)}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

function ResizeToPoints({ points }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (points.length > 0) {
        map.fitBounds(points, { padding: [44, 44], maxZoom: 8 });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [map, points]);

  return null;
}

function NationalTrackingMap({ trips }) {
  const allPoints = [];

  const tripRoutes = trips.map((trip) => {
    const route = [];

    const startLat = readNumber(trip.route_start_lat);
    const startLng = readNumber(trip.route_start_lng);
    if (isValidCoords(startLat, startLng)) {
      route.push({ type: "start", label: "S", lat: startLat, lng: startLng, trip });
    }

    [...(trip.clients || [])]
      .sort((a, b) => Number(a.visit_order || 999999) - Number(b.visit_order || 999999))
      .forEach((client, index) => {
        const lat = readNumber(client.partner_latitude ?? client.visited_lat);
        const lng = readNumber(client.partner_longitude ?? client.visited_lng);

        if (isValidCoords(lat, lng)) {
          route.push({
            type: client.visit_status === "Visitado" ? "visited" : client.visit_status === "En visita" ? "invisit" : "pending",
            label: client.visit_order || index + 1,
            lat,
            lng,
            trip,
            client,
          });
        }
      });

    const last = trip.last_tracking;
    const lastLat = readNumber(last?.lat);
    const lastLng = readNumber(last?.lng);
    if (isValidCoords(lastLat, lastLng)) {
      route.push({ type: "advisor", label: "V", lat: lastLat, lng: lastLng, trip, last });
    }

    route.forEach((point) => allPoints.push([point.lat, point.lng]));
    return route;
  });

  const center = allPoints[0] || [-38.4161, -63.6167];

  return (
    <MapContainer center={center} zoom={5} scrollWheelZoom className="tracking-leaflet-map">
      <ResizeToPoints points={allPoints} />
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {tripRoutes.map((route, tripIndex) => {
        const line = route
          .filter((point) => point.type !== "advisor")
          .map((point) => [point.lat, point.lng]);

        return line.length > 1 ? <Polyline key={`line-${tripIndex}`} positions={line} /> : null;
      })}

      {tripRoutes.flat().map((point, index) => (
        <Marker
          key={`${point.trip.id}-${point.type}-${index}-${point.lat}-${point.lng}`}
          position={[point.lat, point.lng]}
          icon={markerIcon(point.label, point.type)}
        >
          <Popup>
            <strong>{point.trip.asesor}</strong>
            <br />
            {point.trip.nombre}
            <br />
            {point.client ? `${point.client.cliente} · ${point.client.visit_status || "Pendiente"}` : null}
            {point.last ? `Última ubicación: ${point.last.created_at}` : null}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("El servidor devolvió una respuesta inválida.");
  }
}

function getTripStatus(trip) {
  if (trip.supervisor_status === "Aprobada" || trip.status === "Cerrada") return "Cerrada";
  if (trip.status === "En curso") return "En curso";
  if (trip.finished_at || trip.status === "Pendiente devolución") return "Pendiente devolución";
  if (trip.closed_at || trip.status === "Pendiente revisión") return "En revisión";
  return trip.status || "Planificada";
}

export default function TripTrackingDashboard({ user }) {
  const [trips, setTrips] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [advisorFilter, setAdvisorFilter] = useState("Todos");

  useEffect(() => {
    loadOverview();
    const timer = setInterval(loadOverview, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOverview() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("role", user?.role || "");
      params.append("name", user?.name || "");
      params.append("odooUserId", user?.odoo_user_id || "");

      const response = await fetch(`${API_URL}/api/trips/tracking/overview?${params.toString()}`);
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "No se pudo cargar seguimiento de giras.");
      setTrips(Array.isArray(data.trips) ? data.trips : []);
      setMessage("");
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo cargar seguimiento.");
    } finally {
      setLoading(false);
    }
  }

  const advisors = useMemo(() => {
    return Array.from(new Set(trips.map((trip) => trip.asesor).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [trips]);

  const filteredTrips = useMemo(() => {
    const value = search.toLowerCase().trim();

    return trips.filter((trip) => {
      const status = getTripStatus(trip);
      const matchesSearch = !value ||
        (trip.nombre || "").toLowerCase().includes(value) ||
        (trip.asesor || "").toLowerCase().includes(value) ||
        (trip.clients || []).some((client) => (client.cliente || "").toLowerCase().includes(value));
      const matchesStatus = statusFilter === "Todos" || status === statusFilter;
      const matchesAdvisor = advisorFilter === "Todos" || trip.asesor === advisorFilter;
      return matchesSearch && matchesStatus && matchesAdvisor;
    });
  }, [trips, search, statusFilter, advisorFilter]);

  const totalClients = filteredTrips.reduce((sum, trip) => sum + (trip.clients || []).length, 0);
  const visited = filteredTrips.reduce(
    (sum, trip) => sum + (trip.clients || []).filter((client) => client.visit_status === "Visitado").length,
    0
  );
  const inProgress = filteredTrips.filter((trip) => getTripStatus(trip) === "En curso").length;
  const advisorsActive = new Set(filteredTrips.map((trip) => trip.asesor).filter(Boolean)).size;
  const kmPlanned = filteredTrips.reduce((sum, trip) => sum + Number(trip.route_total_km || trip.route_summary?.total_km || 0), 0);
  const withLastLocation = filteredTrips.filter((trip) => trip.last_tracking?.lat && trip.last_tracking?.lng).length;

  return (
    <div className="tracking-dashboard-page">
      <header className="tracking-header">
        <div>
          <p className="eyebrow">Torre de control comercial</p>
          <h1>Seguimiento de giras</h1>
          <p>Mapa operativo para supervisor, gerencia y dueño: asesores, rutas, cobertura y avance real.</p>
        </div>

        <button className="primary-button" onClick={loadOverview} disabled={loading}>
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </header>

      {message && <div className="radiography-error">{message}</div>}

      <section className="tracking-filters-card">
        <input
          className="search-input"
          placeholder="Buscar asesor, gira o cliente..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select className="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option>Todos</option>
          <option>Planificada</option>
          <option>En curso</option>
          <option>Pendiente devolución</option>
          <option>En revisión</option>
          <option>Cerrada</option>
        </select>

        <select className="status-filter" value={advisorFilter} onChange={(event) => setAdvisorFilter(event.target.value)}>
          <option>Todos</option>
          {advisors.map((advisor) => (
            <option key={advisor} value={advisor}>{advisor}</option>
          ))}
        </select>
      </section>

      <section className="tracking-kpi-grid">
        <div><span>Asesores con gira</span><strong>{advisorsActive}</strong></div>
        <div><span>Giras visibles</span><strong>{filteredTrips.length}</strong></div>
        <div><span>En curso</span><strong>{inProgress}</strong></div>
        <div><span>Clientes visitados</span><strong>{visited}/{totalClients}</strong></div>
        <div><span>Km planificados</span><strong>{formatKm(kmPlanned)}</strong></div>
        <div><span>Con última ubicación</span><strong>{withLastLocation}</strong></div>
      </section>

      <section className="tracking-command-grid">
        <div className="tracking-map-card">
          <NationalTrackingMap trips={filteredTrips} />
        </div>

        <aside className="tracking-side-list">
          <div className="route-side-title">
            <h3>Giras y asesores</h3>
            <span>{filteredTrips.length}</span>
          </div>

          {filteredTrips.length === 0 ? (
            <div className="empty-box">No hay giras para los filtros seleccionados.</div>
          ) : (
            filteredTrips.map((trip) => {
              const status = getTripStatus(trip);
              const done = (trip.clients || []).filter((client) => client.visit_status === "Visitado").length;
              const total = (trip.clients || []).length;
              const last = trip.last_tracking;

              return (
                <article className="tracking-advisor-card" key={trip.id}>
                  <div className="tracking-advisor-top">
                    <div>
                      <strong>{trip.asesor}</strong>
                      <span>{trip.nombre}</span>
                    </div>
                    <b>{status}</b>
                  </div>

                  <div className="tracking-progress-bar">
                    <span style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }} />
                  </div>

                  <div className="tracking-card-metrics">
                    <span>{done}/{total} visitas</span>
                    <span>{formatKm(trip.route_total_km || 0)}</span>
                    <span>{formatDate(trip.start_date)} → {formatDate(trip.end_date)}</span>
                  </div>

                  <small>
                    {last
                      ? `Último evento: ${last.event_type} · ${last.created_at}`
                      : "Sin ubicación reportada todavía"}
                  </small>
                </article>
              );
            })
          )}
        </aside>
      </section>
    </div>
  );
}
