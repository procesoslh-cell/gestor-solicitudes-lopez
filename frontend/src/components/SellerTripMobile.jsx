import { useEffect, useMemo, useState } from "react";
import TripMap from "./TripMap";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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

function formatMeters(value) {
  if (value === null || value === undefined || value === "") return "Sin medir";
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue)) return "Sin medir";
  if (numberValue >= 1000) return `${(numberValue / 1000).toFixed(1)} km del punto`;
  return `${Math.round(numberValue)} m del punto`;
}

function readNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function hasCoords(client) {
  const lat = readNumber(client?.partner_latitude ?? client?.visited_lat);
  const lng = readNumber(client?.partner_longitude ?? client?.visited_lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

function getGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo no permite tomar ubicación GPS desde el navegador."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => reject(new Error("No se pudo tomar la ubicación. Activá GPS y permití ubicación para esta app.")),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("El servidor devolvió una respuesta inválida.");
  }
}

export default function SellerTripMobile({ user }) {
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [trip, setTrip] = useState(null);
  const [clients, setClients] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [routeSummary, setRouteSummary] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [result, setResult] = useState("Visitado / relevado");
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedTripId) loadTrip(selectedTripId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTripId]);

  async function loadTrips() {
    try {
      setLoading(true);
      setMessage("");

      const params = new URLSearchParams();
      params.append("role", user?.role || "vendedor");
      params.append("odooUserId", user?.odoo_user_id || "");

      const response = await fetch(`${API_URL}/api/trips?${params.toString()}`);
      const data = await readJson(response);

      if (!response.ok) throw new Error(data?.error || "No se pudieron cargar tus giras.");

      const rows = Array.isArray(data) ? data : [];
      setTrips(rows);

      if (!selectedTripId && rows.length > 0) {
        setSelectedTripId(String(rows[0].id));
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudieron cargar tus giras.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTrip(tripId) {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/trips/${tripId}`);
      const data = await readJson(response);

      if (!response.ok) throw new Error(data?.error || "No se pudo cargar la gira.");

      const nextClients = Array.isArray(data.clients) ? data.clients : [];
      setTrip(data.trip || null);
      setClients(nextClients);
      setTracking(Array.isArray(data.tracking) ? data.tracking : []);
      setRouteSummary(data.route_summary || null);

      if (!selectedClientId && nextClients.length > 0) {
        const next = nextClients.find((client) => client.visit_status !== "Visitado") || nextClients[0];
        setSelectedClientId(String(next.id));
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo cargar la gira.");
    } finally {
      setLoading(false);
    }
  }

  const selectedClient = useMemo(() => {
    return clients.find((client) => String(client.id) === String(selectedClientId)) || null;
  }, [clients, selectedClientId]);

  const visitedCount = clients.filter((client) => client.visit_status === "Visitado").length;
  const inVisitCount = clients.filter((client) => client.visit_status === "En visita").length;
  const pendingCount = Math.max(0, clients.length - visitedCount);
  const completion = clients.length > 0 ? Math.round((visitedCount / clients.length) * 100) : 0;

  const routeStart = useMemo(
    () => ({
      name: trip?.route_start_name || "Punto de salida",
      lat: trip?.route_start_lat || "",
      lng: trip?.route_start_lng || "",
    }),
    [trip]
  );

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data?.error || "No se pudo guardar.");
    return data;
  }

  async function startTrip() {
    if (!trip) return;

    try {
      setSaving(true);
      setMessage("Tomando ubicación para iniciar la gira...");
      const gps = await getGps();
      await postJson(`${API_URL}/api/trips/${trip.id}/start`, gps);
      setMessage("Gira iniciada correctamente.");
      await loadTrip(trip.id);
      await loadTrips();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo iniciar la gira.");
    } finally {
      setSaving(false);
    }
  }

  async function reportLocation() {
    if (!trip) return;

    try {
      setSaving(true);
      setMessage("Tomando ubicación actual...");
      const gps = await getGps();
      await postJson(`${API_URL}/api/trips/${trip.id}/location`, gps);
      setMessage("Ubicación reportada correctamente.");
      await loadTrip(trip.id);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo reportar ubicación.");
    } finally {
      setSaving(false);
    }
  }

  async function startVisit(client) {
    if (!trip || !client) return;

    try {
      setSaving(true);
      setMessage(`Tomando ubicación para iniciar visita a ${client.cliente}...`);
      const gps = await getGps();
      const data = await postJson(
        `${API_URL}/api/trips/${trip.id}/clients/${client.id}/start-visit`,
        gps
      );
      setMessage(`Visita iniciada. ${formatMeters(data.distance_meters)}.`);
      setSelectedClientId(String(client.id));
      await loadTrip(trip.id);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo iniciar la visita.");
    } finally {
      setSaving(false);
    }
  }

  async function finishVisit() {
    if (!trip || !selectedClient) {
      setMessage("Seleccioná un cliente para finalizar la visita.");
      return;
    }

    if (!result) {
      setMessage("Seleccioná el resultado de la visita.");
      return;
    }

    try {
      setSaving(true);
      setMessage("Tomando ubicación final y guardando visita...");
      const gps = await getGps();
      const formData = new FormData();
      formData.append("lat", gps.lat);
      formData.append("lng", gps.lng);
      formData.append("accuracy", gps.accuracy || "");
      formData.append("result", result);
      formData.append("comment", comment);
      if (photo) formData.append("photo", photo);

      const response = await fetch(
        `${API_URL}/api/trips/${trip.id}/clients/${selectedClient.id}/finish-visit`,
        { method: "POST", body: formData }
      );
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "No se pudo finalizar la visita.");

      setMessage(`Visita finalizada. ${formatMeters(data.distance_meters)}.`);
      setComment("");
      setPhoto(null);
      await loadTrip(trip.id);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo finalizar la visita.");
    } finally {
      setSaving(false);
    }
  }

  async function finishTrip() {
    if (!trip) return;

    try {
      setSaving(true);
      setMessage("Tomando ubicación para finalizar la gira...");
      const gps = await getGps();
      await postJson(`${API_URL}/api/trips/${trip.id}/finish`, {
        ...gps,
        comment: "Gira finalizada desde Mi gira móvil.",
      });
      setMessage("Gira finalizada. Queda pendiente la devolución/revisión del supervisor.");
      await loadTrip(trip.id);
      await loadTrips();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo finalizar la gira.");
    } finally {
      setSaving(false);
    }
  }

  function openClientInMaps(client) {
    if (!client || !hasCoords(client)) {
      setMessage("Este cliente todavía no tiene coordenadas para abrir la ruta.");
      return;
    }

    const lat = readNumber(client.partner_latitude ?? client.visited_lat);
    const lng = readNumber(client.partner_longitude ?? client.visited_lng);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
  }

  return (
    <div className="mobile-trip-page">
      <header className="mobile-trip-header">
        <div>
          <p className="eyebrow">PWA vendedor</p>
          <h1>Mi gira</h1>
          <p>Marcá visitas con ubicación, foto, resultado y observaciones desde el celular.</p>
        </div>
      </header>

      {message && <div className="radiography-error mobile-message">{message}</div>}

      <section className="mobile-trip-selector-card">
        <label>Gira asignada</label>
        <select
          className="status-filter"
          value={selectedTripId}
          onChange={(event) => setSelectedTripId(event.target.value)}
        >
          <option value="">Seleccionar gira</option>
          {trips.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nombre} · {formatDate(item.start_date)}
            </option>
          ))}
        </select>
      </section>

      {loading && <div className="empty-box">Cargando...</div>}

      {trip && (
        <>
          <section className="mobile-trip-summary-card">
            <div>
              <span>{trip.status || "Planificada"}</span>
              <h2>{trip.nombre}</h2>
              <p>{trip.asesor} · {formatDate(trip.start_date)} → {formatDate(trip.end_date)}</p>
            </div>

            <div className="mobile-progress-ring">
              <strong>{completion}%</strong>
              <span>{visitedCount}/{clients.length}</span>
            </div>
          </section>

          <section className="mobile-trip-kpis">
            <div><span>Visitados</span><strong>{visitedCount}</strong></div>
            <div><span>Pendientes</span><strong>{pendingCount}</strong></div>
            <div><span>En visita</span><strong>{inVisitCount}</strong></div>
            <div><span>Km plan</span><strong>{formatKm(routeSummary?.total_km || trip.route_total_km || 0)}</strong></div>
          </section>

          <section className="mobile-trip-actions">
            <button className="primary-button" onClick={startTrip} disabled={saving}>
              Iniciar gira
            </button>
            <button className="secondary-button" onClick={reportLocation} disabled={saving}>
              Reportar ubicación
            </button>
            <button className="secondary-button" onClick={finishTrip} disabled={saving}>
              Finalizar gira
            </button>
          </section>

          <section className="mobile-trip-map-card">
            <TripMap
              clients={clients}
              routeStart={routeStart}
              returnToStart={trip?.route_return_to_start === 0 ? false : true}
            />
          </section>

          <section className="mobile-visit-panel">
            <div className="mobile-section-title">
              <h2>Clientes de la ruta</h2>
              <span>{clients.length} punto(s)</span>
            </div>

            <div className="mobile-client-stack">
              {clients.map((client, index) => (
                <article
                  key={client.id}
                  className={`mobile-client-card ${String(client.id) === String(selectedClientId) ? "active" : ""} ${client.visit_status === "Visitado" ? "done" : ""}`}
                  onClick={() => setSelectedClientId(String(client.id))}
                >
                  <div className="mobile-client-order">{client.visit_order || index + 1}</div>
                  <div className="mobile-client-body">
                    <strong>{client.cliente}</strong>
                    <span>{[client.direccion, client.localidad, client.provincia].filter(Boolean).join(" · ") || "Sin dirección"}</span>
                    <small>
                      {client.visit_status || "Pendiente"}
                      {client.visit_result ? ` · ${client.visit_result}` : ""}
                      {client.visit_distance_meters ? ` · ${formatMeters(client.visit_distance_meters)}` : ""}
                    </small>
                  </div>
                  <div className="mobile-client-buttons">
                    <button type="button" onClick={(event) => { event.stopPropagation(); openClientInMaps(client); }}>
                      Maps
                    </button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); startVisit(client); }} disabled={saving}>
                      Iniciar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mobile-finish-card">
            <h2>Finalizar visita</h2>
            <p>
              Cliente seleccionado: <strong>{selectedClient?.cliente || "sin seleccionar"}</strong>
            </p>

            <select
              className="status-filter"
              value={result}
              onChange={(event) => setResult(event.target.value)}
            >
              <option>Visitado / relevado</option>
              <option>Vendió</option>
              <option>No compró</option>
              <option>No estaba</option>
              <option>Cerrado</option>
              <option>Reprogramar</option>
              <option>Cobranza</option>
              <option>Reclamo</option>
              <option>Otro</option>
            </select>

            <textarea
              className="trip-textarea"
              placeholder="Observaciones de la visita..."
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />

            <label className="mobile-photo-input">
              Foto/evidencia opcional
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => setPhoto(event.target.files?.[0] || null)}
              />
            </label>

            {photo && <small className="photo-name">Foto seleccionada: {photo.name}</small>}

            <button className="primary-button" onClick={finishVisit} disabled={saving || !selectedClient}>
              {saving ? "Guardando..." : "Finalizar visita"}
            </button>
          </section>

          <section className="mobile-timeline-card">
            <div className="mobile-section-title">
              <h2>Últimos eventos</h2>
              <span>{tracking.length}</span>
            </div>

            {tracking.length === 0 ? (
              <div className="empty-box">Todavía no hay eventos registrados.</div>
            ) : (
              tracking.slice(0, 12).map((event) => (
                <div className="mobile-timeline-row" key={event.id}>
                  <strong>{event.event_type}</strong>
                  <span>{event.cliente || trip.nombre}</span>
                  <small>{event.created_at} {event.distance_meters ? `· ${formatMeters(event.distance_meters)}` : ""}</small>
                  {event.photo_url && (
                    <a href={`${API_URL}${event.photo_url}`} target="_blank" rel="noreferrer">Ver foto</a>
                  )}
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
