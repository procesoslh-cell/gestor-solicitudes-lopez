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

function readNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function hasValidCoords(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat !== 0 &&
    lng !== 0
  );
}

function formatKm(value) {
  const numberValue = Number(value || 0);
  return `${numberValue.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

function getClientLat(client) {
  return readNumber(client?.partner_latitude ?? client?.visited_lat);
}

function getClientLng(client) {
  return readNumber(client?.partner_longitude ?? client?.visited_lng);
}

function getTripClosureSla(trip) {
  if (!trip?.end_date) {
    return {
      label: "Sin fecha fin",
      className: "sla-gray",
      detail: "La gira no tiene fecha de finalización cargada.",
    };
  }

  if (trip.supervisor_status === "Aprobada" || trip.status === "Cerrada") {
    return {
      label: "Cerrada",
      className: "sla-green",
      detail: "La gira ya fue revisada por supervisor.",
    };
  }

  if (trip.closed_at) {
    return {
      label: "En revisión",
      className: "sla-yellow",
      detail: "El asesor cargó la devolución. Falta control supervisor.",
    };
  }

  const now = new Date();
  const endDate = new Date(trip.end_date);
  endDate.setHours(23, 59, 59, 999);

  if (now <= endDate) {
    return {
      label: "En proceso",
      className: "sla-green",
      detail: `Finaliza ${formatDate(trip.end_date)}.`,
    };
  }

  const dueAt = new Date(endDate);
  dueAt.setDate(dueAt.getDate() + 3);

  const diffHours = Math.ceil(
    (dueAt.getTime() - now.getTime()) / 1000 / 60 / 60
  );

  if (diffHours >= 0) {
    return {
      label: "Pendiente devolución",
      className: diffHours <= 24 ? "sla-yellow" : "sla-green",
      detail: `El asesor tiene ${diffHours}hs para cerrar resultados.`,
    };
  }

  return {
    label: "Vencida",
    className: "sla-red",
    detail: `La devolución está vencida hace ${Math.abs(diffHours)}hs.`,
  };
}

export default function TripDetail({ tripId, user, onClose, onRefresh }) {
  const [trip, setTrip] = useState(null);
  const [clients, setClients] = useState([]);
  const [routeSummary, setRouteSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [comment, setComment] = useState("");
  const [savingVisit, setSavingVisit] = useState(false);

  const [pedidos, setPedidos] = useState("");
  const [monto, setMonto] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [closing, setClosing] = useState(false);

  const [supervisorResult, setSupervisorResult] = useState("Aprobada");
  const [supervisorComments, setSupervisorComments] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  const [routeStartName, setRouteStartName] = useState("Punto de salida");
  const [routeStartLat, setRouteStartLat] = useState("");
  const [routeStartLng, setRouteStartLng] = useState("");
  const [returnToStart, setReturnToStart] = useState(true);
  const [savingRoute, setSavingRoute] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const [locationDraft, setLocationDraft] = useState({
    partner_latitude: "",
    partner_longitude: "",
    direccion: "",
    localidad: "",
    provincia: "",
    codigo_postal: "",
    address_partner_id: "",
    address_label: "",
    address_type: "",
  });
  const [savingLocation, setSavingLocation] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [addressOptions, setAddressOptions] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState("");

  const [message, setMessage] = useState("");

  const isSupervisor = ["admin", "supervisor", "gerente", "jefe"].includes(
    user?.role
  );

  useEffect(() => {
    loadTrip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    if (!selectedClient) {
      setAddressOptions([]);
      setSelectedAddressId("");
      return;
    }

    setLocationDraft({
      partner_latitude: selectedClient.partner_latitude || "",
      partner_longitude: selectedClient.partner_longitude || "",
      direccion: selectedClient.direccion || "",
      localidad: selectedClient.localidad || "",
      provincia: selectedClient.provincia || "",
      codigo_postal: selectedClient.codigo_postal || "",
      address_partner_id: selectedClient.address_partner_id || "",
      address_label: selectedClient.address_label || "",
      address_type: selectedClient.address_type || "",
    });
    setSelectedAddressId(selectedClient.address_partner_id || "");
    loadClientAddressOptions(selectedClient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient]);

  async function readJson(response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error("El servidor devolvió una respuesta inválida.");
    }
  }

  async function loadClientAddressOptions(client) {
    if (!client?.cliente_id) return;

    try {
      setLoadingAddresses(true);

      const response = await fetch(
        `${API_URL}/api/trips/clients/${client.cliente_id}/addresses`
      );
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudieron cargar direcciones de Odoo.");
      }

      const addresses = Array.isArray(data.addresses) ? data.addresses : [];
      setAddressOptions(addresses);

      if (!client.address_partner_id && addresses.length > 0) {
        const delivery = addresses.find((address) => address.address_type === "delivery");
        const preferred = delivery || addresses[0];
        setSelectedAddressId(preferred.address_partner_id || "");
      }
    } catch (error) {
      console.error(error);
      setAddressOptions([]);
    } finally {
      setLoadingAddresses(false);
    }
  }

  function applyAddressOption(address) {
    if (!address) return;

    setSelectedAddressId(address.address_partner_id || "");
    setLocationDraft((prev) => ({
      ...prev,
      direccion: address.direccion || "",
      localidad: address.localidad || "",
      provincia: address.provincia || "",
      codigo_postal: address.codigo_postal || "",
      partner_latitude: address.partner_latitude || "",
      partner_longitude: address.partner_longitude || "",
      address_partner_id: address.address_partner_id || "",
      address_label: address.address_label || "",
      address_type: address.address_type || "",
    }));
  }

  async function useSelectedOdooAddress() {
    if (!selectedClient) {
      setMessage("Seleccioná un cliente primero.");
      return;
    }

    const selectedAddress = addressOptions.find(
      (address) => String(address.address_partner_id) === String(selectedAddressId)
    );

    if (!selectedAddress) {
      setMessage("Seleccioná una dirección de Odoo para este cliente.");
      return;
    }

    try {
      setGeocoding(true);
      setMessage("Aplicando dirección de Odoo y estimando coordenadas...");

      const response = await fetch(
        `${API_URL}/api/trips/${tripId}/clients/${selectedClient.id}/address`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address_partner_id: selectedAddress.address_partner_id,
            geocode: true,
          }),
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo aplicar la dirección.");
      }

      setRouteSummary(data.route_summary || null);
      setMessage("Dirección aplicada. Si había coincidencia, el punto ya queda ubicado en el mapa.");
      await loadTrip();
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Error aplicando dirección de Odoo.");
    } finally {
      setGeocoding(false);
    }
  }

  function hydrateRouteState(nextTrip) {
    setRouteStartName(nextTrip?.route_start_name || "Punto de salida");
    setRouteStartLat(nextTrip?.route_start_lat || "");
    setRouteStartLng(nextTrip?.route_start_lng || "");
    setReturnToStart(nextTrip?.route_return_to_start === 0 ? false : true);
  }

  async function loadTrip() {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/trips/${tripId}`);
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cargar la gira.");
      }

      const nextTrip = data.trip || null;
      const nextClients = Array.isArray(data.clients) ? data.clients : [];

      setTrip(nextTrip);
      setClients(nextClients);
      setRouteSummary(data.route_summary || null);
      setPedidos(nextTrip?.result_orders_count || "");
      setMonto(nextTrip?.result_estimated_amount || "");
      setObservaciones(nextTrip?.result_notes || "");
      setSupervisorResult(nextTrip?.supervisor_status || "Aprobada");
      setSupervisorComments(nextTrip?.supervisor_comments || "");
      hydrateRouteState(nextTrip);

      if (selectedClient) {
        const refreshed = nextClients.find(
          (client) => client.id === selectedClient.id
        );
        setSelectedClient(refreshed || null);
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo cargar la gira.");
    } finally {
      setLoading(false);
    }
  }

  const visitedClients = useMemo(
    () => clients.filter((client) => client.visit_status === "Visitado"),
    [clients]
  );

  const unvisitedClients = useMemo(
    () => clients.filter((client) => client.visit_status !== "Visitado"),
    [clients]
  );

  const clientsWithCoords = useMemo(
    () =>
      clients.filter((client) => {
        const lat = getClientLat(client);
        const lng = getClientLng(client);
        return hasValidCoords(lat, lng);
      }),
    [clients]
  );

  const routeStart = useMemo(
    () => ({
      name: routeStartName,
      lat: routeStartLat,
      lng: routeStartLng,
    }),
    [routeStartName, routeStartLat, routeStartLng]
  );

  const canEditRoute =
    trip?.status !== "Cerrada" &&
    trip?.supervisor_status !== "Aprobada" &&
    !trip?.closed_at;

  async function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("El navegador no permite geolocalización."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => reject(new Error("No se pudo obtener la ubicación.")),
        {
          enableHighAccuracy: true,
          timeout: 10000,
        }
      );
    });
  }

  async function useCurrentPositionAsStart() {
    try {
      setMessage("Obteniendo ubicación del punto de salida...");
      const position = await getCurrentPosition();
      setRouteStartLat(position.lat);
      setRouteStartLng(position.lng);
      setMessage("Ubicación cargada. Guardá la ruta para recalcular km.");
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo obtener ubicación.");
    }
  }

  async function saveRouteSettings() {
    const lat = readNumber(routeStartLat);
    const lng = readNumber(routeStartLng);

    if (!hasValidCoords(lat, lng)) {
      setMessage("Cargá latitud y longitud válidas para el punto de salida.");
      return;
    }

    try {
      setSavingRoute(true);

      const response = await fetch(`${API_URL}/api/trips/${tripId}/route-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_start_name: routeStartName,
          route_start_lat: lat,
          route_start_lng: lng,
          route_return_to_start: returnToStart,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo guardar la configuración de ruta.");
      }

      setMessage("Ruta actualizada correctamente.");
      setRouteSummary(data.route_summary || null);
      await loadTrip();
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Error guardando ruta.");
    } finally {
      setSavingRoute(false);
    }
  }

  async function saveClientOrder(nextClients) {
    try {
      setSavingOrder(true);
      setClients(nextClients);

      const response = await fetch(`${API_URL}/api/trips/${tripId}/clients/order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIds: nextClients.map((client) => client.id),
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo guardar el orden.");
      }

      setClients(Array.isArray(data.clients) ? data.clients : nextClients);
      setRouteSummary(data.route_summary || null);
      setMessage("Orden de visita actualizado.");
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudo actualizar el orden.");
      await loadTrip();
    } finally {
      setSavingOrder(false);
    }
  }

  function moveClient(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= clients.length || savingOrder) return;

    const nextClients = [...clients];
    const current = nextClients[index];
    nextClients[index] = nextClients[targetIndex];
    nextClients[targetIndex] = current;

    const normalized = nextClients.map((client, itemIndex) => ({
      ...client,
      visit_order: itemIndex + 1,
    }));

    saveClientOrder(normalized);
  }

  async function saveClientLocation() {
    if (!selectedClient) {
      setMessage("Seleccioná un cliente para editar su ubicación.");
      return;
    }

    const lat = readNumber(locationDraft.partner_latitude);
    const lng = readNumber(locationDraft.partner_longitude);
    const hasCoords = hasValidCoords(lat, lng);

    if (!locationDraft.direccion && !locationDraft.localidad && !hasCoords) {
      setMessage("Cargá una dirección/localidad o coordenadas para el cliente.");
      return;
    }

    try {
      setSavingLocation(true);

      const response = await fetch(
        `${API_URL}/api/trips/${tripId}/clients/${selectedClient.id}/location`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...locationDraft,
            partner_latitude: hasCoords ? lat : null,
            partner_longitude: hasCoords ? lng : null,
          }),
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo guardar la ubicación.");
      }

      setMessage(
        hasCoords
          ? "Ubicación del cliente actualizada."
          : "Dirección guardada. Usá Estimar este cliente para ubicarlo en el mapa."
      );
      setRouteSummary(data.route_summary || null);
      await loadTrip();
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Error guardando ubicación.");
    } finally {
      setSavingLocation(false);
    }
  }

  async function geocodeTripClients(clientRowId = null) {
    try {
      setGeocoding(true);
      setMessage(
        clientRowId
          ? "Estimando coordenadas del cliente seleccionado..."
          : "Estimando coordenadas desde direcciones de Odoo..."
      );

      const response = await fetch(`${API_URL}/api/trips/${tripId}/geocode-clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRowId,
          limit: 25,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudieron estimar coordenadas.");
      }

      const updated = Number(data.updated || 0);
      const failed = Number(data.failed || 0);

      setClients(Array.isArray(data.clients) ? data.clients : clients);
      setRouteSummary(data.route_summary || null);
      setMessage(
        `Geocodificación finalizada: ${updated} cliente(s) ubicados, ${failed} sin coincidencia.`
      );

      await loadTrip();
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Error estimando coordenadas.");
    } finally {
      setGeocoding(false);
    }
  }

  function openRouteInMaps() {
    const points = [];
    const startLat = readNumber(routeStartLat);
    const startLng = readNumber(routeStartLng);

    if (hasValidCoords(startLat, startLng)) {
      points.push(`${startLat},${startLng}`);
    }

    clients.forEach((client) => {
      const lat = getClientLat(client);
      const lng = getClientLng(client);
      if (hasValidCoords(lat, lng)) points.push(`${lat},${lng}`);
    });

    if (returnToStart && hasValidCoords(startLat, startLng) && points.length > 1) {
      points.push(`${startLat},${startLng}`);
    }

    if (points.length < 2) {
      setMessage("Necesitás al menos dos puntos con coordenadas para abrir la ruta.");
      return;
    }

    const origin = points[0];
    const destination = points[points.length - 1];
    const waypoints = points.slice(1, -1).slice(0, 23).join("|");
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    if (waypoints) url.searchParams.set("waypoints", waypoints);

    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  async function registerVisit() {
    if (!selectedClient) {
      setMessage("Seleccioná un cliente.");
      return;
    }

    try {
      setSavingVisit(true);
      setMessage("Obteniendo ubicación...");

      const position = await getCurrentPosition();

      const response = await fetch(`${API_URL}/api/trips/visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          cliente_id: selectedClient.cliente_id,
          comentario: comment,
          lat: position.lat,
          lng: position.lng,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo registrar la visita.");
      }

      setMessage("Visita registrada correctamente.");
      setSelectedClient(null);
      setComment("");

      await loadTrip();
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error(error);
      setMessage(
        error.message ||
          "No se pudo registrar la visita. Revisá permisos de ubicación."
      );
    } finally {
      setSavingVisit(false);
    }
  }

  async function closeTrip() {
    if (!pedidos && !monto && !observaciones.trim()) {
      setMessage("Cargá al menos un resultado u observación.");
      return;
    }

    try {
      setClosing(true);

      const response = await fetch(`${API_URL}/api/trips/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          pedidos: Number(pedidos || 0),
          monto: Number(monto || 0),
          observaciones,
          user: user?.name || "Sistema",
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo cerrar la gira.");
      }

      setMessage("Gira cerrada y enviada a revisión.");
      await loadTrip();

      if (onRefresh) onRefresh();

      setTimeout(() => {
        if (onClose) onClose();
      }, 700);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Error cerrando la gira.");
    } finally {
      setClosing(false);
    }
  }

  async function reviewTrip() {
    if (!supervisorComments.trim()) {
      setMessage("Cargá una devolución u observación de supervisor.");
      return;
    }

    try {
      setReviewSaving(true);

      const response = await fetch(`${API_URL}/api/trips/${tripId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supervisor_status: supervisorResult,
          supervisor_comments: supervisorComments,
          supervisor: user?.name || "Supervisor",
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo guardar la revisión.");
      }

      setMessage("Revisión de supervisor guardada.");
      await loadTrip();

      if (onRefresh) onRefresh();

      setTimeout(() => {
        if (onClose) onClose();
      }, 700);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Error guardando revisión.");
    } finally {
      setReviewSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal trip-detail-modal">
          <div className="empty-box">Cargando gira...</div>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="modal-overlay">
        <div className="modal trip-detail-modal">
          <div className="empty-box">No se encontró la gira.</div>
          <div className="trip-modal-footer">
            <button className="secondary-button" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sla = getTripClosureSla(trip);

  const canCloseTrip =
    trip.status !== "Cerrada" &&
    trip.supervisor_status !== "Aprobada" &&
    !trip.closed_at;

  const canReviewTrip = isSupervisor && Boolean(trip.closed_at);

  return (
    <div className="modal-overlay">
      <div className="modal trip-detail-modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Detalle de gira</p>
            <h2>{trip.nombre}</h2>
            <p>
              {trip.asesor} · {formatDate(trip.start_date)} →{" "}
              {formatDate(trip.end_date)}
            </p>
          </div>

          <button onClick={onClose}>×</button>
        </div>

        {message && <div className="trip-message">{message}</div>}

        <div className="trip-detail-body">
          <section className="trip-summary-panel">
            <div className="detail-grid trip-route-kpis">
              <div className="detail-box">
                <strong>Estado cierre</strong>
                <span className={`sla-pill ${sla.className}`}>
                  {sla.label}
                </span>
                <p>{sla.detail}</p>
              </div>

              <div className="detail-box">
                <strong>Clientes</strong>
                <p>{clients.length}</p>
              </div>

              <div className="detail-box">
                <strong>Visitados</strong>
                <p>{visitedClients.length}</p>
              </div>

              <div className="detail-box">
                <strong>Km estimados</strong>
                <p>{formatKm(routeSummary?.total_km || trip.route_total_km || 0)}</p>
                <span>Estimado por coordenadas</span>
              </div>

              <div className="detail-box">
                <strong>Con coordenadas</strong>
                <p>{routeSummary?.clients_with_coords ?? clientsWithCoords.length}</p>
              </div>

              <div className="detail-box">
                <strong>Sin coordenadas</strong>
                <p>{routeSummary?.clients_without_coords ?? clients.length - clientsWithCoords.length}</p>
              </div>
            </div>
          </section>

          <section className="trip-close-panel trip-route-settings">
            <div className="trip-panel-title-row">
              <div>
                <h3>Configuración de ruta</h3>
                <p>
                  Definí el punto de salida, activá regreso y guardá para estimar
                  kilómetros. Si no cargás salida, la ida y vuelta se calcula cerrando el circuito al primer cliente. Para medir desde la empresa, cargá la salida.
                </p>
              </div>

              <button className="secondary-button" onClick={openRouteInMaps}>
                Abrir ruta en Maps
              </button>
            </div>

            <div className="trip-form-grid route-form-grid">
              <input
                className="search-input"
                placeholder="Nombre punto de salida"
                value={routeStartName}
                onChange={(event) => setRouteStartName(event.target.value)}
                disabled={!canEditRoute}
              />

              <input
                className="search-input"
                type="number"
                step="any"
                placeholder="Latitud salida"
                value={routeStartLat}
                onChange={(event) => setRouteStartLat(event.target.value)}
                disabled={!canEditRoute}
              />

              <input
                className="search-input"
                type="number"
                step="any"
                placeholder="Longitud salida"
                value={routeStartLng}
                onChange={(event) => setRouteStartLng(event.target.value)}
                disabled={!canEditRoute}
              />

              <label className="trip-checkbox trip-return-checkbox">
                <input
                  type="checkbox"
                  checked={returnToStart}
                  onChange={() => setReturnToStart(!returnToStart)}
                  disabled={!canEditRoute}
                />
                Ida y vuelta
              </label>
            </div>

            <div className="trip-route-actions">
              <button
                className="secondary-button"
                onClick={useCurrentPositionAsStart}
                disabled={!canEditRoute}
              >
                Usar mi ubicación como salida
              </button>

              <button
                className="secondary-button geo-button"
                onClick={() => geocodeTripClients()}
                disabled={!canEditRoute || geocoding}
              >
                {geocoding ? "Estimando..." : "Estimar coordenadas por dirección"}
              </button>

              <button
                className="primary-button"
                onClick={saveRouteSettings}
                disabled={!canEditRoute || savingRoute}
              >
                {savingRoute ? "Guardando..." : "Guardar y recalcular km"}
              </button>
            </div>
          </section>

          <div className="trip-detail-layout">
            <section className="trip-clients-panel">
              <h3>Clientes de la gira</h3>
              <p className="trip-helper">
                Reordená la secuencia para que el mapa numere las visitas.
              </p>

              <div className="trip-clients-list">
                {clients.length === 0 ? (
                  <div className="empty-box">No hay clientes asignados.</div>
                ) : (
                  clients.map((client, index) => {
                    const lat = getClientLat(client);
                    const lng = getClientLng(client);
                    const hasCoords = hasValidCoords(lat, lng);

                    return (
                      <div
                        key={client.id}
                        className={`trip-client-row route-client-row ${
                          selectedClient?.id === client.id ? "selected" : ""
                        }`}
                        onClick={() => setSelectedClient(client)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") setSelectedClient(client);
                        }}
                      >
                        <div className="trip-client-info">
                          <strong>
                            {client.visit_order ? `${client.visit_order}. ` : ""}
                            {client.cliente}
                          </strong>
                          <span>
                            {client.objetivo || "Visita comercial"}
                            {client.prioridad ? ` · ${client.prioridad}` : ""}
                          </span>
                          <span>
                            {client.visit_status || "Pendiente"}{" "}
                            {client.visited_at
                              ? `· ${formatDate(client.visited_at)}`
                              : ""}
                          </span>
                          <span>
                            {client.address_label || "Dirección Odoo"}
                            {client.localidad ? ` · ${client.localidad}` : ""}
                          </span>
                          <span className={hasCoords ? "coords-ok" : "coords-missing"}>
                            {hasCoords ? "Con coordenadas" : "Sin coordenadas"}
                          </span>
                          {client.geocode_status && (
                            <span className="geocode-status">
                              {client.geocode_status}
                            </span>
                          )}
                        </div>

                        <div className="route-order-controls">
                          <button
                            type="button"
                            className="icon-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveClient(index, -1);
                            }}
                            disabled={!canEditRoute || index === 0 || savingOrder}
                            title="Subir"
                          >
                            ↑
                          </button>

                          <button
                            type="button"
                            className="icon-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveClient(index, 1);
                            }}
                            disabled={
                              !canEditRoute || index === clients.length - 1 || savingOrder
                            }
                            title="Bajar"
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="trip-map-panel">
              <div className="trip-panel-title-row">
                <div>
                  <h3>Mapa de la gira</h3>
                  <p>
                    Puntos numerados según orden de visita. Verde visitado,
                    azul pendiente, S salida y F regreso.
                  </p>
                </div>
              </div>

              <div className="trip-map-container">
                <TripMap
                  clients={clients}
                  routeStart={routeStart}
                  returnToStart={returnToStart}
                />
              </div>

              {routeSummary?.segments?.length > 0 && (
                <div className="route-segments">
                  {routeSummary.segments.slice(0, 8).map((segment, index) => (
                    <div key={`${segment.from}-${segment.to}-${index}`}>
                      <span>
                        {index + 1}. {segment.from} → {segment.to}
                      </span>
                      <strong>{formatKm(segment.km)}</strong>
                    </div>
                  ))}

                  {routeSummary.segments.length > 8 && (
                    <small>
                      +{routeSummary.segments.length - 8} tramos adicionales
                    </small>
                  )}
                </div>
              )}
            </section>
          </div>

          {selectedClient && (
            <section className="trip-close-panel client-location-panel">
              <h3>Ubicación del cliente seleccionado</h3>
              <p>
                Cliente: <strong>{selectedClient.cliente}</strong>. Si Odoo no
                trae coordenadas, podés elegir la dirección de entrega o principal de Odoo y estimarla en el mapa.
              </p>

              <div className="odoo-address-selector">
                <div>
                  <strong>Dirección usada para la gira</strong>
                  <span>
                    {selectedClient.address_label || "Sin dirección Odoo seleccionada"}
                    {selectedClient.address_type ? ` · ${selectedClient.address_type}` : ""}
                  </span>
                </div>

                <select
                  className="status-filter"
                  value={selectedAddressId}
                  onChange={(event) => {
                    const value = event.target.value;
                    const address = addressOptions.find(
                      (item) => String(item.address_partner_id) === String(value)
                    );
                    applyAddressOption(address);
                  }}
                  disabled={!canEditRoute || loadingAddresses || addressOptions.length === 0}
                >
                  <option value="">
                    {loadingAddresses ? "Cargando direcciones..." : "Seleccionar dirección de Odoo"}
                  </option>
                  {addressOptions.map((address) => (
                    <option key={address.address_partner_id} value={address.address_partner_id}>
                      {address.address_label} · {address.direccion || "Sin calle"} · {address.localidad || "Sin localidad"}
                    </option>
                  ))}
                </select>

                <button
                  className="secondary-button geo-button"
                  onClick={useSelectedOdooAddress}
                  disabled={!canEditRoute || geocoding || !selectedAddressId}
                >
                  {geocoding ? "Estimando..." : "Usar dirección seleccionada"}
                </button>
              </div>

              <div className="trip-form-grid route-form-grid">
                <input
                  className="search-input"
                  placeholder="Dirección"
                  value={locationDraft.direccion}
                  onChange={(event) =>
                    setLocationDraft((prev) => ({
                      ...prev,
                      direccion: event.target.value,
                    }))
                  }
                  disabled={!canEditRoute}
                />

                <input
                  className="search-input"
                  placeholder="Localidad"
                  value={locationDraft.localidad}
                  onChange={(event) =>
                    setLocationDraft((prev) => ({
                      ...prev,
                      localidad: event.target.value,
                    }))
                  }
                  disabled={!canEditRoute}
                />

                <input
                  className="search-input"
                  placeholder="Provincia"
                  value={locationDraft.provincia}
                  onChange={(event) =>
                    setLocationDraft((prev) => ({
                      ...prev,
                      provincia: event.target.value,
                    }))
                  }
                  disabled={!canEditRoute}
                />

                <input
                  className="search-input"
                  placeholder="Código postal"
                  value={locationDraft.codigo_postal}
                  onChange={(event) =>
                    setLocationDraft((prev) => ({
                      ...prev,
                      codigo_postal: event.target.value,
                    }))
                  }
                  disabled={!canEditRoute}
                />

                <input
                  className="search-input"
                  type="number"
                  step="any"
                  placeholder="Latitud cliente"
                  value={locationDraft.partner_latitude}
                  onChange={(event) =>
                    setLocationDraft((prev) => ({
                      ...prev,
                      partner_latitude: event.target.value,
                    }))
                  }
                  disabled={!canEditRoute}
                />

                <input
                  className="search-input"
                  type="number"
                  step="any"
                  placeholder="Longitud cliente"
                  value={locationDraft.partner_longitude}
                  onChange={(event) =>
                    setLocationDraft((prev) => ({
                      ...prev,
                      partner_longitude: event.target.value,
                    }))
                  }
                  disabled={!canEditRoute}
                />

                <button
                  className="secondary-button geo-button"
                  onClick={() => geocodeTripClients(selectedClient.id)}
                  disabled={!canEditRoute || geocoding}
                >
                  {geocoding ? "Estimando..." : "Estimar este cliente"}
                </button>

                <button
                  className="primary-button"
                  onClick={saveClientLocation}
                  disabled={!canEditRoute || savingLocation}
                >
                  {savingLocation ? "Guardando..." : "Guardar ubicación"}
                </button>
              </div>
            </section>
          )}

          {canCloseTrip && (
            <section className="trip-close-panel">
              <h3>Registrar visita</h3>
              <p>
                Seleccioná un cliente, cargá comentario y registrá la ubicación
                del dispositivo.
              </p>

              <textarea
                className="trip-textarea"
                placeholder="Comentario de visita..."
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />

              <button
                className="primary-button trip-save-button"
                onClick={registerVisit}
                disabled={savingVisit}
              >
                {savingVisit
                  ? "Guardando visita..."
                  : "Marcar visitado con ubicación"}
              </button>
            </section>
          )}

          <section className="trip-close-panel">
            <h3>Cierre de gira del asesor</h3>

            <div className="trip-form-grid">
              <input
                className="search-input"
                type="number"
                placeholder="Pedidos levantados"
                value={pedidos}
                onChange={(event) => setPedidos(event.target.value)}
                disabled={!canCloseTrip}
              />

              <input
                className="search-input"
                type="number"
                placeholder="Monto estimado"
                value={monto}
                onChange={(event) => setMonto(event.target.value)}
                disabled={!canCloseTrip}
              />
            </div>

            <textarea
              className="trip-textarea"
              placeholder="Resultado general de la gira, oportunidades, problemas detectados..."
              value={observaciones}
              onChange={(event) => setObservaciones(event.target.value)}
              disabled={!canCloseTrip}
            />

            {canCloseTrip ? (
              <button
                className="primary-button trip-save-button"
                onClick={closeTrip}
                disabled={closing}
              >
                {closing ? "Cerrando..." : "Cerrar gira y enviar a revisión"}
              </button>
            ) : (
              <div className="empty-box">
                La devolución del asesor ya fue enviada.
              </div>
            )}
          </section>

          <section className="trip-close-panel">
            <h3>Control supervisor</h3>

            {!trip.closed_at ? (
              <div className="empty-box">
                Todavía falta la devolución del asesor.
              </div>
            ) : (
              <>
                <div className="collection-summary-list">
                  <div>
                    <span>Pedidos</span>
                    <strong>{trip.result_orders_count || 0}</strong>
                  </div>

                  <div>
                    <span>Monto estimado</span>
                    <strong>
                      {Number(trip.result_estimated_amount || 0).toLocaleString(
                        "es-AR",
                        {
                          style: "currency",
                          currency: "ARS",
                        }
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Estado supervisor</span>
                    <strong>{trip.supervisor_status || "Pendiente"}</strong>
                  </div>
                </div>

                <label>
                  Resultado supervisor
                  <select
                    className="status-filter"
                    value={supervisorResult}
                    onChange={(event) =>
                      setSupervisorResult(event.target.value)
                    }
                    disabled={!canReviewTrip}
                  >
                    <option>Aprobada</option>
                    <option>Devuelta</option>
                    <option>Observada</option>
                  </select>
                </label>

                <textarea
                  className="trip-textarea"
                  placeholder="Devolución del supervisor, oportunidades, correcciones o acciones a seguir..."
                  value={supervisorComments}
                  onChange={(event) =>
                    setSupervisorComments(event.target.value)
                  }
                  disabled={!canReviewTrip}
                />

                {canReviewTrip && (
                  <button
                    className="primary-button trip-save-button"
                    onClick={reviewTrip}
                    disabled={reviewSaving}
                  >
                    {reviewSaving ? "Guardando..." : "Guardar revisión y cerrar"}
                  </button>
                )}
              </>
            )}
          </section>

          <section className="trip-close-panel">
            <h3>Resultado asesor</h3>
            <p>{trip.result_notes || "Sin devolución cargada."}</p>
          </section>

          {trip.supervisor_comments && (
            <section className="trip-close-panel">
              <h3>Devolución supervisor</h3>
              <p>{trip.supervisor_comments}</p>
              <span>{trip.supervisor_reviewed_at || ""}</span>
            </section>
          )}
        </div>

        <div className="trip-modal-footer">
          <button className="secondary-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
