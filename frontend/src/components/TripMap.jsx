import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function readNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function isValidCoords(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat !== 0 &&
    lng !== 0
  );
}

function createRouteIcon(label, type = "pending") {
  const safeLabel = String(label || "?").slice(0, 3);

  return L.divIcon({
    className: `trip-route-marker ${type}`,
    html: `<span>${safeLabel}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

function ResizeMapFix({ points }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();

      if (points.length > 0) {
        map.fitBounds(points, {
          padding: [40, 40],
          maxZoom: 14,
        });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [map, points]);

  return null;
}

export default function TripMap({
  clients = [],
  routeStart = null,
  returnToStart = true,
}) {
  const orderedClients = [...clients].sort((a, b) => {
    const orderA = Number(a.visit_order || 999999);
    const orderB = Number(b.visit_order || 999999);

    if (orderA !== orderB) return orderA - orderB;
    return String(a.cliente || "").localeCompare(String(b.cliente || ""));
  });

  const clientsWithCoords = orderedClients
    .map((client) => {
      const lat = readNumber(client.partner_latitude ?? client.visited_lat);
      const lng = readNumber(client.partner_longitude ?? client.visited_lng);

      return {
        ...client,
        mapLat: lat,
        mapLng: lng,
      };
    })
    .filter((client) => isValidCoords(client.mapLat, client.mapLng));

  const startLat = readNumber(routeStart?.lat);
  const startLng = readNumber(routeStart?.lng);
  const hasStart = isValidCoords(startLat, startLng);

  const mapPoints = [];

  if (hasStart) {
    mapPoints.push({
      key: "start",
      type: "start",
      label: "S",
      title: routeStart?.name || "Salida",
      lat: startLat,
      lng: startLng,
    });
  }

  clientsWithCoords.forEach((client, index) => {
    mapPoints.push({
      key: `client-${client.id}`,
      type: client.visit_status === "Visitado" ? "visited" : "pending",
      label: String(client.visit_order || index + 1),
      title: client.cliente,
      status: client.visit_status === "Visitado" ? "Visitado" : "Pendiente",
      comment: client.visit_comment || "",
      lat: client.mapLat,
      lng: client.mapLng,
    });
  });

  if (hasStart && returnToStart && clientsWithCoords.length > 0) {
    mapPoints.push({
      key: "return",
      type: "return",
      label: "F",
      title: routeStart?.name || "Regreso",
      lat: startLat,
      lng: startLng,
    });
  } else if (!hasStart && returnToStart && clientsWithCoords.length > 1) {
    const firstClient = clientsWithCoords[0];
    mapPoints.push({
      key: "return-first-client",
      type: "return",
      label: "F",
      title: `Regreso a ${firstClient.cliente}`,
      lat: firstClient.mapLat,
      lng: firstClient.mapLng,
    });
  }

  if (mapPoints.length === 0) {
    return (
      <div className="trip-map-empty">
        Todavía no hay coordenadas para dibujar la ruta. Usá la opción de estimar
        coordenadas desde dirección de entrega/principal de Odoo. Para medir ida y vuelta
        desde la empresa, definí también el punto de salida.
      </div>
    );
  }

  const center = [mapPoints[0].lat, mapPoints[0].lng];
  const route = mapPoints.map((point) => [point.lat, point.lng]);

  return (
    <MapContainer
      key={mapPoints.map((point) => `${point.key}-${point.lat}-${point.lng}`).join("-")}
      center={center}
      zoom={12}
      scrollWheelZoom
      className="trip-leaflet-map"
    >
      <ResizeMapFix points={route} />

      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {route.length > 1 && <Polyline positions={route} />}

      {mapPoints.map((point) => (
        <Marker
          key={point.key}
          position={[point.lat, point.lng]}
          icon={createRouteIcon(point.label, point.type)}
        >
          <Popup>
            <strong>{point.title || point.label}</strong>
            <br />
            {point.type === "start" && "Punto de salida"}
            {point.type === "return" && "Regreso"}
            {point.type !== "start" && point.type !== "return" && point.status}
            {point.comment ? (
              <>
                <br />
                {point.comment}
              </>
            ) : null}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
