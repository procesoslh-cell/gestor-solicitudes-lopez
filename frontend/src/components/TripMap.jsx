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

const visitedIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const pendingIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

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

export default function TripMap({ clients = [] }) {
  const clientsWithCoords = clients
    .map((client) => {
      const lat = client.partner_latitude || client.visited_lat;
      const lng = client.partner_longitude || client.visited_lng;

      return {
        ...client,
        mapLat: Number(lat),
        mapLng: Number(lng),
      };
    })
    .filter(
      (client) =>
        Number.isFinite(client.mapLat) &&
        Number.isFinite(client.mapLng) &&
        client.mapLat !== 0 &&
        client.mapLng !== 0
    );

  if (clientsWithCoords.length === 0) {
    return (
      <div className="trip-map-empty">
        Todavía no hay ubicaciones registradas. Marcá una visita con ubicación
        para visualizarla en el mapa.
      </div>
    );
  }

  const center = [clientsWithCoords[0].mapLat, clientsWithCoords[0].mapLng];

  const route = clientsWithCoords.map((client) => [
    client.mapLat,
    client.mapLng,
  ]);

  return (
    <MapContainer
      key={clientsWithCoords.map((client) => client.id).join("-")}
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

      {clientsWithCoords.length > 1 && <Polyline positions={route} />}

      {clientsWithCoords.map((client, index) => {
        const visited = client.visit_status === "Visitado";

        return (
          <Marker
            key={`${client.id}-${client.mapLat}-${client.mapLng}`}
            position={[client.mapLat, client.mapLng]}
            icon={visited ? visitedIcon : pendingIcon}
          >
            <Popup>
              <strong>
                #{index + 1} {client.cliente}
              </strong>
              <br />
              {visited ? "Visitado" : "Pendiente"}
              <br />
              {client.visit_comment || ""}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}