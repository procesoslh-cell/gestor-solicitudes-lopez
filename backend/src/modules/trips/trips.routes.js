const multer = require("multer");
const path = require("path");
const fs = require("fs");

module.exports = function registerRoutes(context) {
  const {
    app,
    db,
    axios,
    queryOdoo,
    createNotification,
    emailUserByName,
    fireAndForget,
  } = context;

  const visitUploadsDir = path.join(__dirname, "..", "..", "..", "uploads", "trip-visits");

  if (!fs.existsSync(visitUploadsDir)) {
    fs.mkdirSync(visitUploadsDir, { recursive: true });
  }

  const visitUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, visitUploadsDir),
      filename: (req, file, cb) => {
        const cleanName = String(file.originalname || "foto.jpg").replace(/[^a-zA-Z0-9.\-_]/g, "_");
        cb(null, `${Date.now()}-${cleanName}`);
      },
    }),
    limits: { fileSize: 12 * 1024 * 1024 },
  });

  function safeText(value) {
    return String(value || "").trim();
  }

  function safeNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function getClientLat(client) {
    return safeNumber(client?.partner_latitude ?? client?.visited_lat);
  }

  function getClientLng(client) {
    return safeNumber(client?.partner_longitude ?? client?.visited_lng);
  }

  function hasValidCoords(lat, lng) {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat !== 0 &&
      lng !== 0
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function compactJoin(parts, separator = ", ") {
    return parts
      .map((part) => safeText(part))
      .filter(Boolean)
      .join(separator);
  }

  function uniq(values) {
    return Array.from(
      new Set(
        values
          .map((value) => safeText(value))
          .filter(Boolean)
      )
    );
  }

  function cleanAddressPiece(value) {
    let text = safeText(value);

    if (!text) return "";

    text = text
      .replace(/\b(calle\s*2|calle\s*dos)\s*\.{2,}/gi, " ")
      .replace(/\b(piso|p\.?|dpto|dto|depto|departamento|oficina|of\.?|unidad|uf)\s*[:.#º°\-]?\s*[a-z0-9\-/]+/gi, " ")
      .replace(/\b(torre|block|bloque|manzana|mz)\s*[:.#º°\-]?\s*[a-z0-9\-/]+/gi, " ")
      .replace(/\s+,/g, ",")
      .replace(/,+/g, ",")
      .replace(/\s+/g, " ")
      .trim();

    return text.replace(/^,+|,+$/g, "").trim();
  }

  function normalizeRouteStreet(value) {
    let text = cleanAddressPiece(value);

    text = text
      .replace(/\bKM\s*(\d+)/gi, "KM $1")
      .replace(/\bKILOMETRO\s*(\d+)/gi, "KM $1")
      .replace(/\bRTA\b/gi, "Ruta")
      .replace(/\bRP\b/gi, "Ruta Provincial")
      .replace(/\bRN\b/gi, "Ruta Nacional")
      .replace(/\s+/g, " ")
      .trim();

    return text;
  }

  function normalizeProvince(value) {
    return cleanAddressPiece(value)
      .replace(/\bdel\b/gi, "Del")
      .replace(/\bde\b/gi, "De")
      .trim();
  }

  function buildAddressQueries(client) {
    const street = normalizeRouteStreet(client?.direccion);
    const city = cleanAddressPiece(client?.localidad);
    const province = normalizeProvince(client?.provincia);
    const zip = cleanAddressPiece(client?.codigo_postal);
    const name = cleanAddressPiece(client?.cliente);

    const strongStreet = street && !/^calle\s*2\b/i.test(street) ? street : "";

    return uniq([
      compactJoin([strongStreet, city, province, zip, "Argentina"]),
      compactJoin([strongStreet, city, province, "Argentina"]),
      compactJoin([strongStreet, province, "Argentina"]),
      compactJoin([city, province, zip, "Argentina"]),
      compactJoin([city, province, "Argentina"]),
      compactJoin([zip, city, province, "Argentina"]),
      compactJoin([name, city, province, "Argentina"]),
    ]).filter((query) => query && query !== "Argentina");
  }

  function buildAddressQuery(client) {
    return buildAddressQueries(client)[0] || "";
  }

  function toAddressPayload(row, priority = 99, kind = "principal") {
    if (!row) return null;

    const street = normalizeRouteStreet(row.street);
    const street2 = cleanAddressPiece(row.street2);
    const direccion = compactJoin([street, street2], " ");

    return {
      address_partner_id: row.address_partner_id || row.cliente_id || row.id || null,
      address_label: safeText(row.address_label || row.name || row.cliente || "Dirección"),
      address_type: safeText(row.address_type || row.type || kind || "principal"),
      direccion,
      localidad: cleanAddressPiece(row.city),
      provincia: normalizeProvince(row.provincia),
      codigo_postal: cleanAddressPiece(row.zip),
      partner_latitude: safeNumber(row.partner_latitude),
      partner_longitude: safeNumber(row.partner_longitude),
      priority,
    };
  }

  function hasAddressData(address) {
    return Boolean(
      safeText(address?.direccion) ||
      safeText(address?.localidad) ||
      safeText(address?.provincia) ||
      safeText(address?.codigo_postal)
    );
  }

  async function loadOdooAddressOptions(clienteId) {
    if (!queryOdoo || !clienteId) return [];

    try {
      const rows = await queryOdoo(
        `
        WITH target AS (
          SELECT
            rp.id,
            rp.parent_id,
            COALESCE(rp.parent_id, rp.id) AS root_id
          FROM res_partner rp
          WHERE rp.id = $1
          LIMIT 1
        )
        SELECT
          rp.id AS address_partner_id,
          rp.name,
          rp.type,
          rp.street,
          rp.street2,
          rp.city,
          rp.zip,
          rp.partner_latitude,
          rp.partner_longitude,
          rcs.name AS provincia,
          CASE
            WHEN rp.type = 'delivery' THEN 1
            WHEN rp.id = (SELECT id FROM target) THEN 2
            WHEN rp.id = (SELECT root_id FROM target) THEN 3
            WHEN rp.type = 'other' THEN 4
            WHEN rp.type = 'contact' THEN 5
            ELSE 9
          END AS priority,
          CASE
            WHEN rp.type = 'delivery' THEN 'Dirección de entrega'
            WHEN rp.id = (SELECT id FROM target) THEN 'Dirección principal'
            WHEN rp.id = (SELECT root_id FROM target) THEN 'Dirección de facturación / empresa'
            WHEN rp.type = 'invoice' THEN 'Dirección de factura'
            ELSE 'Dirección asociada'
          END AS address_label,
          COALESCE(rp.type, 'contact') AS address_type
        FROM res_partner rp
        LEFT JOIN res_partner parent
          ON parent.id = rp.parent_id
        LEFT JOIN res_country_state rcs
          ON rcs.id = COALESCE(rp.state_id, parent.state_id)
        WHERE rp.active = true
          AND EXISTS (SELECT 1 FROM target)
          AND (
            rp.id = (SELECT id FROM target)
            OR rp.id = (SELECT root_id FROM target)
            OR rp.parent_id = (SELECT root_id FROM target)
          )
          AND (
            NULLIF(rp.street, '') IS NOT NULL
            OR NULLIF(rp.street2, '') IS NOT NULL
            OR NULLIF(rp.city, '') IS NOT NULL
            OR NULLIF(rp.zip, '') IS NOT NULL
          )
        ORDER BY priority, rp.id
        `,
        [Number(clienteId)]
      );

      const seen = new Set();
      return (rows || [])
        .map((row) => toAddressPayload(row, Number(row.priority || 99), row.address_type))
        .filter((address) => {
          if (!address || !hasAddressData(address)) return false;
          const key = String(address.address_partner_id || `${address.direccion}-${address.localidad}`);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99));
    } catch (error) {
      console.error("ERROR CARGANDO DIRECCIONES ODOO:", error.message);
      return [];
    }
  }

  async function loadOdooAddress(clienteId, options = {}) {
    const addresses = await loadOdooAddressOptions(clienteId);

    if (addresses.length === 0) return null;

    const preferDelivery = options.preferDelivery !== false;

    if (preferDelivery) {
      const delivery = addresses.find((address) => address.address_type === "delivery");
      if (delivery) return delivery;
    }

    return addresses[0];
  }

  async function geocodeClientAddress(client) {
    if (!axios) {
      throw new Error("No está disponible el servicio HTTP para geocodificar.");
    }

    const queries = buildAddressQueries(client);

    if (queries.length === 0) {
      return {
        ok: false,
        query: "",
        error: "El cliente no tiene dirección suficiente para estimar coordenadas.",
      };
    }

    let lastError = "No se encontró coincidencia para la dirección.";

    for (const query of queries) {
      try {
        const response = await axios.get(
          "https://nominatim.openstreetmap.org/search",
          {
            params: {
              q: query,
              format: "json",
              addressdetails: 1,
              limit: 1,
              countrycodes: "ar",
            },
            headers: {
              "User-Agent": process.env.GEOCODER_USER_AGENT || "gestor-solicitudes-lopez/1.0",
            },
            timeout: 12000,
          }
        );

        const match = Array.isArray(response.data) ? response.data[0] : null;

        if (!match) {
          lastError = `Sin coincidencia para: ${query}`;
          continue;
        }

        const lat = safeNumber(match.lat);
        const lng = safeNumber(match.lon);

        if (!hasValidCoords(lat, lng)) {
          lastError = `Coordenadas inválidas para: ${query}`;
          continue;
        }

        const firstStrongQuery = queries[0];
        const precision = query === firstStrongQuery ? "dirección" : "localidad / aproximado";

        return {
          ok: true,
          query,
          lat,
          lng,
          display_name: match.display_name || "",
          source: `OpenStreetMap Nominatim (${precision})`,
        };
      } catch (error) {
        lastError = error.message;
      }

      await sleep(350);
    }

    return {
      ok: false,
      query: queries[0],
      error: lastError,
    };
  }

  function distanceKm(a, b) {
    if (!a || !b) return 0;
    if (!hasValidCoords(a.lat, a.lng) || !hasValidCoords(b.lat, b.lng)) return 0;

    const radiusKm = 6371;
    const toRad = (value) => (value * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return 2 * radiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function distanceMeters(a, b) {
    return Math.round(distanceKm(a, b) * 1000);
  }

  function getTripClientRow(tripId, clientRowId) {
    return db.prepare(`
      SELECT *
      FROM trip_clients
      WHERE trip_id = ?
        AND id = ?
    `).get(tripId, clientRowId);
  }

  function registerTripTracking({
    tripId,
    tripClient = null,
    eventType,
    lat = null,
    lng = null,
    accuracy = null,
    result = "",
    comment = "",
    photoUrl = "",
  }) {
    const trip = db.prepare(`
      SELECT *
      FROM trips
      WHERE id = ?
    `).get(tripId);

    if (!trip) return null;

    const eventLat = safeNumber(lat);
    const eventLng = safeNumber(lng);
    const clientLat = getClientLat(tripClient);
    const clientLng = getClientLng(tripClient);
    const meters =
      hasValidCoords(eventLat, eventLng) && hasValidCoords(clientLat, clientLng)
        ? distanceMeters({ lat: eventLat, lng: eventLng }, { lat: clientLat, lng: clientLng })
        : null;

    const info = db.prepare(`
      INSERT INTO trip_tracking (
        trip_id, asesor_id, asesor, trip_client_id, cliente_id, cliente,
        event_type, lat, lng, accuracy, distance_meters, result, comment, photo_url, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      trip.id,
      trip.asesor_id,
      trip.asesor,
      tripClient?.id || null,
      tripClient?.cliente_id || null,
      tripClient?.cliente || null,
      safeText(eventType),
      eventLat,
      eventLng,
      safeNumber(accuracy),
      meters,
      safeText(result),
      safeText(comment),
      safeText(photoUrl)
    );

    return { id: info.lastInsertRowid, distance_meters: meters };
  }

  function buildRouteSummary(trip, clients) {
    const orderedClients = [...(clients || [])].sort((a, b) => {
      const orderA = Number(a.visit_order || 999999);
      const orderB = Number(b.visit_order || 999999);
      if (orderA !== orderB) return orderA - orderB;
      return String(a.cliente || "").localeCompare(String(b.cliente || ""));
    });

    const clientsWithCoords = orderedClients
      .map((client) => {
        const lat = getClientLat(client);
        const lng = getClientLng(client);

        return {
          id: client.id,
          cliente_id: client.cliente_id,
          cliente: client.cliente,
          visit_order: client.visit_order,
          lat,
          lng,
        };
      })
      .filter((client) => hasValidCoords(client.lat, client.lng));

    const startLat = safeNumber(trip?.route_start_lat);
    const startLng = safeNumber(trip?.route_start_lng);
    const hasStart = hasValidCoords(startLat, startLng);
    const returnToStart = trip?.route_return_to_start === 0 ? false : true;

    const points = [];

    if (hasStart) {
      points.push({
        type: "start",
        label: trip?.route_start_name || "Punto de salida",
        lat: startLat,
        lng: startLng,
      });
    }

    clientsWithCoords.forEach((client) => {
      points.push({
        type: "client",
        label: client.cliente,
        lat: client.lat,
        lng: client.lng,
        cliente_id: client.cliente_id,
        visit_order: client.visit_order,
      });
    });

    if (returnToStart && hasStart && clientsWithCoords.length > 0) {
      points.push({
        type: "return",
        label: trip?.route_start_name || "Regreso",
        lat: startLat,
        lng: startLng,
      });
    } else if (returnToStart && !hasStart && clientsWithCoords.length > 1) {
      const firstClient = clientsWithCoords[0];
      points.push({
        type: "return",
        label: `Regreso a ${firstClient.cliente}`,
        lat: firstClient.lat,
        lng: firstClient.lng,
        cliente_id: firstClient.cliente_id,
        visit_order: firstClient.visit_order,
      });
    }

    let totalKm = 0;
    const segments = [];

    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      const km = distanceKm(from, to);
      totalKm += km;
      segments.push({
        from: from.label,
        to: to.label,
        km: Number(km.toFixed(1)),
      });
    }

    return {
      total_km: Number(totalKm.toFixed(1)),
      clients_with_coords: clientsWithCoords.length,
      clients_without_coords: orderedClients.length - clientsWithCoords.length,
      return_to_start: returnToStart,
      has_start: hasStart,
      points,
      segments,
    };
  }

  function persistRouteTotal(tripId) {
    const trip = db.prepare(`
      SELECT *
      FROM trips
      WHERE id = ?
    `).get(tripId);

    if (!trip) return null;

    const clients = db.prepare(`
      SELECT *
      FROM trip_clients
      WHERE trip_id = ?
      ORDER BY COALESCE(visit_order, 999999), cliente
    `).all(tripId);

    const summary = buildRouteSummary(trip, clients);

    db.prepare(`
      UPDATE trips
      SET route_total_km = ?
      WHERE id = ?
    `).run(summary.total_km, tripId);

    return summary;
  }

  async function geocodeMissingTripClients(tripId, options = {}) {
    const clientRowId = options.clientRowId || null;
    const maxLimit = Math.max(1, Math.min(Number(options.limit) || 25, 50));

    let clients = [];

    if (clientRowId) {
      clients = db.prepare(`
        SELECT *
        FROM trip_clients
        WHERE trip_id = ?
          AND id = ?
        LIMIT 1
      `).all(tripId, clientRowId);
    } else {
      clients = db.prepare(`
        SELECT *
        FROM trip_clients
        WHERE trip_id = ?
          AND (
            partner_latitude IS NULL
            OR partner_longitude IS NULL
            OR partner_latitude = 0
            OR partner_longitude = 0
          )
        ORDER BY COALESCE(visit_order, 999999), cliente
        LIMIT ?
      `).all(tripId, maxLimit);
    }

    const results = [];

    for (const client of clients) {
      let workingClient = { ...client };

      const needsOdooAddress =
        !safeText(workingClient.direccion) ||
        !safeText(workingClient.localidad) ||
        !safeText(workingClient.provincia) ||
        !safeText(workingClient.address_partner_id);

      if (needsOdooAddress) {
        const odooAddress = await loadOdooAddress(workingClient.cliente_id, {
          preferDelivery: true,
        });

        if (odooAddress) {
          workingClient = {
            ...workingClient,
            direccion: odooAddress.direccion || safeText(workingClient.direccion),
            localidad: odooAddress.localidad || safeText(workingClient.localidad),
            provincia: odooAddress.provincia || safeText(workingClient.provincia),
            codigo_postal: odooAddress.codigo_postal || safeText(workingClient.codigo_postal),
            address_partner_id: odooAddress.address_partner_id || workingClient.address_partner_id,
            address_label: odooAddress.address_label || workingClient.address_label,
            address_type: odooAddress.address_type || workingClient.address_type,
            partner_latitude: odooAddress.partner_latitude || workingClient.partner_latitude,
            partner_longitude: odooAddress.partner_longitude || workingClient.partner_longitude,
          };

          db.prepare(`
            UPDATE trip_clients
            SET direccion = ?,
                localidad = ?,
                provincia = ?,
                codigo_postal = ?,
                address_partner_id = ?,
                address_label = ?,
                address_type = ?,
                partner_latitude = COALESCE(?, partner_latitude),
                partner_longitude = COALESCE(?, partner_longitude)
            WHERE id = ?
          `).run(
            safeText(workingClient.direccion),
            safeText(workingClient.localidad),
            safeText(workingClient.provincia),
            safeText(workingClient.codigo_postal),
            safeNumber(workingClient.address_partner_id),
            safeText(workingClient.address_label),
            safeText(workingClient.address_type),
            hasValidCoords(
              safeNumber(workingClient.partner_latitude),
              safeNumber(workingClient.partner_longitude)
            ) ? safeNumber(workingClient.partner_latitude) : null,
            hasValidCoords(
              safeNumber(workingClient.partner_latitude),
              safeNumber(workingClient.partner_longitude)
            ) ? safeNumber(workingClient.partner_longitude) : null,
            workingClient.id
          );
        }
      }

      try {
        const geocode = await geocodeClientAddress(workingClient);

        if (geocode.ok) {
          db.prepare(`
            UPDATE trip_clients
            SET partner_latitude = ?,
                partner_longitude = ?,
                geocode_status = ?,
                geocode_source = ?,
                geocode_query = ?,
                geocoded_at = datetime('now')
            WHERE id = ?
          `).run(
            geocode.lat,
            geocode.lng,
            "Estimado",
            geocode.source,
            geocode.query,
            workingClient.id
          );

          results.push({
            id: workingClient.id,
            cliente: workingClient.cliente,
            ok: true,
            lat: geocode.lat,
            lng: geocode.lng,
            query: geocode.query,
          });
        } else {
          db.prepare(`
            UPDATE trip_clients
            SET geocode_status = ?,
                geocode_query = ?,
                geocoded_at = datetime('now')
            WHERE id = ?
          `).run(
            "Sin coincidencia",
            geocode.query,
            workingClient.id
          );

          results.push({
            id: workingClient.id,
            cliente: workingClient.cliente,
            ok: false,
            query: geocode.query,
            error: geocode.error,
          });
        }
      } catch (geoError) {
        db.prepare(`
          UPDATE trip_clients
          SET geocode_status = ?,
              geocode_query = ?,
              geocoded_at = datetime('now')
          WHERE id = ?
        `).run(
          "Error",
          buildAddressQuery(workingClient),
          workingClient.id
        );

        results.push({
          id: workingClient.id,
          cliente: workingClient.cliente,
          ok: false,
          query: buildAddressQuery(workingClient),
          error: geoError.message,
        });
      }

      if (!clientRowId) {
        await sleep(1100);
      }
    }

    const updatedClients = db.prepare(`
      SELECT *
      FROM trip_clients
      WHERE trip_id = ?
      ORDER BY COALESCE(visit_order, 999999), cliente
    `).all(tripId);

    const routeSummary = persistRouteTotal(Number(tripId));

    return {
      processed: results.length,
      updated: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
      clients: updatedClients,
      route_summary: routeSummary,
    };
  }

  function notifyUser(userName, title, message, requestId = null) {
    if (!userName) return;

    try {
      if (createNotification) {
        createNotification({
          userName,
          requestId,
          title,
          message,
        });
      }
    } catch (error) {
      console.error("ERROR NOTIFICANDO GIRA:", error);
    }

    try {
      if (emailUserByName && fireAndForget) {
        fireAndForget(
          emailUserByName(userName, title, message)
        );
      }
    } catch (error) {
      console.error("ERROR EMAIL GIRA:", error);
    }
  }

  async function addClientToTrip(tripId, cliente, options = {}) {
    const clientId = Number(cliente?.cliente_id || 0);

    if (!tripId || !clientId) {
      throw new Error("Faltan datos del cliente para agregar a la gira.");
    }

    const existing = db.prepare(`
      SELECT *
      FROM trip_clients
      WHERE trip_id = ?
        AND cliente_id = ?
      LIMIT 1
    `).get(tripId, clientId);

    if (existing) {
      return {
        alreadyExists: true,
        client: existing,
      };
    }

    let enrichedClient = {
      ...cliente,
      direccion:
        cliente?.direccion ||
        compactJoin([cliente?.street, cliente?.street2]) ||
        options.direccion ||
        "",
      localidad: cliente?.localidad || cliente?.city || options.localidad || "",
      provincia:
        cliente?.provincia ||
        cliente?.state ||
        cliente?.state_name ||
        options.provincia ||
        "",
      codigo_postal: cliente?.codigo_postal || cliente?.zip || options.codigo_postal || "",
    };

    const odooAddress = await loadOdooAddress(clientId, {
      preferDelivery: true,
    });

    if (odooAddress && !safeText(enrichedClient.address_partner_id)) {
      enrichedClient = {
        ...enrichedClient,
        direccion: odooAddress.direccion || safeText(enrichedClient.direccion),
        localidad: odooAddress.localidad || safeText(enrichedClient.localidad),
        provincia: odooAddress.provincia || safeText(enrichedClient.provincia),
        codigo_postal: odooAddress.codigo_postal || safeText(enrichedClient.codigo_postal),
        address_partner_id: odooAddress.address_partner_id,
        address_label: odooAddress.address_label,
        address_type: odooAddress.address_type,
        partner_latitude: odooAddress.partner_latitude || enrichedClient.partner_latitude,
        partner_longitude: odooAddress.partner_longitude || enrichedClient.partner_longitude,
      };
    } else if (odooAddress) {
      enrichedClient = {
        ...enrichedClient,
        direccion: safeText(enrichedClient.direccion) || odooAddress.direccion,
        localidad: safeText(enrichedClient.localidad) || odooAddress.localidad,
        provincia: safeText(enrichedClient.provincia) || odooAddress.provincia,
        codigo_postal: safeText(enrichedClient.codigo_postal) || odooAddress.codigo_postal,
      };
    }

    const orderRow = db.prepare(`
      SELECT COALESCE(MAX(visit_order), 0) + 1 AS next_order
      FROM trip_clients
      WHERE trip_id = ?
    `).get(tripId);

    const result = db.prepare(`
      INSERT INTO trip_clients (
        trip_id,
        cliente_id,
        cliente,
        estado,
        partner_latitude,
        partner_longitude,
        direccion,
        localidad,
        provincia,
        codigo_postal,
        address_partner_id,
        address_label,
        address_type,
        objetivo,
        prioridad,
        source,
        created_by,
        created_at,
        visit_order,
        visit_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
    `).run(
      tripId,
      clientId,
      safeText(enrichedClient.cliente),
      safeText(enrichedClient.estado),
      safeNumber(enrichedClient.partner_latitude),
      safeNumber(enrichedClient.partner_longitude),
      safeText(enrichedClient.direccion),
      safeText(enrichedClient.localidad),
      safeText(enrichedClient.provincia),
      safeText(enrichedClient.codigo_postal),
      safeNumber(enrichedClient.address_partner_id),
      safeText(enrichedClient.address_label),
      safeText(enrichedClient.address_type),
      safeText(enrichedClient.objetivo || options.objetivo || "Visita comercial"),
      safeText(enrichedClient.prioridad || options.prioridad || "Media"),
      safeText(enrichedClient.source || options.source || "Gira comercial"),
      safeText(enrichedClient.created_by || options.created_by || "Sistema"),
      Number(orderRow?.next_order || 1),
      "Pendiente"
    );

    const created = db.prepare(`
      SELECT *
      FROM trip_clients
      WHERE id = ?
    `).get(result.lastInsertRowid);

    return {
      alreadyExists: false,
      client: created,
    };
  }

  app.post("/api/trips", async (req, res) => {
    try {
      const {
        asesor_id,
        asesor,
        nombre,
        mes,
        observaciones,
        start_date,
        end_date,
        clientes,
      } = req.body;

      if (!asesor_id || !asesor || !nombre || !mes || !start_date || !end_date) {
        return res.status(400).json({
          error: "Faltan datos obligatorios de la gira.",
        });
      }

      const tripResult = db.prepare(`
        INSERT INTO trips (
          asesor_id,
          asesor,
          nombre,
          mes,
          observaciones,
          start_date,
          end_date,
          status,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        asesor_id,
        asesor,
        safeText(nombre),
        safeText(mes),
        safeText(observaciones),
        start_date,
        end_date,
        "Planificada"
      );

      const tripId = tripResult.lastInsertRowid;

      if (Array.isArray(clientes) && clientes.length > 0) {
        for (const cliente of clientes) {
          await addClientToTrip(tripId, cliente, {
            source: "Creación de gira",
          });
        }
      }

      const geocodeSummary = await geocodeMissingTripClients(tripId, {
        limit: Array.isArray(clientes) ? Math.min(clientes.length, 25) : 25,
      });
      const routeSummary = geocodeSummary.route_summary || persistRouteTotal(tripId);

      notifyUser(
        asesor,
        "Nueva gira asignada",
        `Se creó la gira ${nombre}. Inicio: ${start_date}. Fin: ${end_date}.`,
        tripId
      );

      res.json({
        success: true,
        tripId,
        route_summary: routeSummary,
        geocode_summary: geocodeSummary,
      });
    } catch (error) {
      console.error("ERROR CREANDO GIRA:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.get("/api/trips", (req, res) => {
    try {
      const { role, odooUserId } = req.query;

      let rows;

      if (role === "vendedor" && odooUserId) {
        rows = db
          .prepare(`
            SELECT *
            FROM trips
            WHERE asesor_id = ?
            ORDER BY id DESC
          `)
          .all(Number(odooUserId));
      } else {
        rows = db
          .prepare(`
            SELECT *
            FROM trips
            ORDER BY id DESC
          `)
          .all();
      }

      res.json(rows);
    } catch (error) {
      console.error("ERROR LISTANDO GIRAS:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.post("/api/trips/:id/clients", async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body || {};

      const trip = db.prepare(`
        SELECT *
        FROM trips
        WHERE id = ?
      `).get(id);

      if (!trip) {
        return res.status(404).json({
          error: "Gira no encontrada",
        });
      }

      const result = await addClientToTrip(Number(id), data, {
        source: data.source || "Radiografía comercial",
        objetivo: data.objetivo,
        prioridad: data.prioridad,
        created_by: data.created_by,
      });

      const geocodeSummary = await geocodeMissingTripClients(Number(id), {
        clientRowId: result.client?.id,
        limit: 1,
      });
      const routeSummary = geocodeSummary.route_summary || persistRouteTotal(Number(id));

      notifyUser(
        trip.asesor,
        "Cliente agregado a gira",
        `${data.created_by || "Supervisor"} agregó ${data.cliente || "un cliente"} a la gira ${trip.nombre}.`,
        Number(id)
      );

      res.json({
        success: true,
        alreadyExists: result.alreadyExists,
        client: result.client,
        route_summary: routeSummary,
        geocode_summary: geocodeSummary,
      });
    } catch (error) {
      console.error("ERROR AGREGANDO CLIENTE A GIRA:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.get("/api/trips/clients/:clienteId/addresses", async (req, res) => {
    try {
      const { clienteId } = req.params;

      if (!clienteId) {
        return res.status(400).json({
          error: "clienteId es obligatorio.",
        });
      }

      const addresses = await loadOdooAddressOptions(Number(clienteId));

      res.json({
        success: true,
        addresses,
      });
    } catch (error) {
      console.error("ERROR DIRECCIONES CLIENTE ODOO:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.patch("/api/trips/:id/clients/:clientRowId/address", async (req, res) => {
    try {
      const { id, clientRowId } = req.params;
      const { address_partner_id, geocode = true } = req.body || {};

      const tripClient = db.prepare(`
        SELECT *
        FROM trip_clients
        WHERE trip_id = ?
          AND id = ?
      `).get(id, clientRowId);

      if (!tripClient) {
        return res.status(404).json({
          error: "Cliente de gira no encontrado",
        });
      }

      const addresses = await loadOdooAddressOptions(tripClient.cliente_id);
      const selected = addresses.find(
        (address) => String(address.address_partner_id) === String(address_partner_id)
      ) || addresses[0];

      if (!selected) {
        return res.status(404).json({
          error: "No se encontraron direcciones asociadas al cliente en Odoo.",
        });
      }

      const selectedLat = safeNumber(selected.partner_latitude);
      const selectedLng = safeNumber(selected.partner_longitude);
      const hasSelectedCoords = hasValidCoords(selectedLat, selectedLng);

      db.prepare(`
        UPDATE trip_clients
        SET direccion = ?,
            localidad = ?,
            provincia = ?,
            codigo_postal = ?,
            address_partner_id = ?,
            address_label = ?,
            address_type = ?,
            partner_latitude = CASE WHEN ? IS NULL THEN NULL ELSE ? END,
            partner_longitude = CASE WHEN ? IS NULL THEN NULL ELSE ? END,
            geocode_status = NULL,
            geocode_source = NULL,
            geocode_query = NULL,
            geocoded_at = NULL
        WHERE trip_id = ?
          AND id = ?
      `).run(
        safeText(selected.direccion),
        safeText(selected.localidad),
        safeText(selected.provincia),
        safeText(selected.codigo_postal),
        safeNumber(selected.address_partner_id),
        safeText(selected.address_label),
        safeText(selected.address_type),
        hasSelectedCoords ? selectedLat : null,
        hasSelectedCoords ? selectedLat : null,
        hasSelectedCoords ? selectedLng : null,
        hasSelectedCoords ? selectedLng : null,
        id,
        clientRowId
      );

      let geocodeSummary = null;

      if (geocode && !hasSelectedCoords) {
        geocodeSummary = await geocodeMissingTripClients(Number(id), {
          clientRowId: Number(clientRowId),
          limit: 1,
        });
      }

      const updated = db.prepare(`
        SELECT *
        FROM trip_clients
        WHERE trip_id = ?
          AND id = ?
      `).get(id, clientRowId);

      const routeSummary = geocodeSummary?.route_summary || persistRouteTotal(Number(id));

      res.json({
        success: true,
        client: updated,
        addresses,
        route_summary: routeSummary,
        geocode_summary: geocodeSummary,
      });
    } catch (error) {
      console.error("ERROR SELECCIONANDO DIRECCION CLIENTE:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.get("/api/trips/tracking/overview", (req, res) => {
    try {
      const { role, odooUserId } = req.query;

      let trips;

      if (role === "vendedor" && odooUserId) {
        trips = db.prepare(`
          SELECT *
          FROM trips
          WHERE asesor_id = ?
          ORDER BY id DESC
          LIMIT 80
        `).all(Number(odooUserId));
      } else {
        trips = db.prepare(`
          SELECT *
          FROM trips
          ORDER BY id DESC
          LIMIT 120
        `).all();
      }

      const payload = trips.map((trip) => {
        const clients = db.prepare(`
          SELECT *
          FROM trip_clients
          WHERE trip_id = ?
          ORDER BY COALESCE(visit_order, 999999), cliente
        `).all(trip.id);

        const tracking = db.prepare(`
          SELECT *
          FROM trip_tracking
          WHERE trip_id = ?
          ORDER BY id DESC
          LIMIT 80
        `).all(trip.id);

        const lastTracking = tracking[0] || null;
        const routeSummary = buildRouteSummary(trip, clients);

        return {
          ...trip,
          route_total_km: routeSummary.total_km,
          clients,
          tracking,
          last_tracking: lastTracking,
          route_summary: routeSummary,
        };
      });

      res.json({ trips: payload });
    } catch (error) {
      console.error("ERROR OVERVIEW TRACKING:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/trips/:id/start", (req, res) => {
    try {
      const { id } = req.params;
      const { lat, lng, accuracy } = req.body || {};

      const trip = db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id);
      if (!trip) return res.status(404).json({ error: "Gira no encontrada" });

      db.prepare(`
        UPDATE trips
        SET status = 'En curso', started_at = COALESCE(started_at, datetime('now'))
        WHERE id = ?
      `).run(id);

      registerTripTracking({
        tripId: Number(id),
        eventType: "Inicio de gira",
        lat,
        lng,
        accuracy,
        comment: "El asesor inició la gira desde el celular.",
      });

      const updated = db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id);
      res.json({ success: true, trip: updated });
    } catch (error) {
      console.error("ERROR INICIANDO GIRA:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/trips/:id/finish", (req, res) => {
    try {
      const { id } = req.params;
      const { lat, lng, accuracy, comment } = req.body || {};

      const trip = db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id);
      if (!trip) return res.status(404).json({ error: "Gira no encontrada" });

      db.prepare(`
        UPDATE trips
        SET status = 'Pendiente devolución', finished_at = datetime('now')
        WHERE id = ?
      `).run(id);

      registerTripTracking({
        tripId: Number(id),
        eventType: "Fin de gira",
        lat,
        lng,
        accuracy,
        comment: comment || "El asesor finalizó la gira desde el celular.",
      });

      const updated = db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id);
      res.json({ success: true, trip: updated });
    } catch (error) {
      console.error("ERROR FINALIZANDO GIRA:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/trips/:id/location", (req, res) => {
    try {
      const { id } = req.params;
      const { lat, lng, accuracy, comment } = req.body || {};

      const trip = db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id);
      if (!trip) return res.status(404).json({ error: "Gira no encontrada" });

      const tracking = registerTripTracking({
        tripId: Number(id),
        eventType: "Ubicación manual",
        lat,
        lng,
        accuracy,
        comment: comment || "Ubicación actual reportada desde el celular.",
      });

      res.json({ success: true, tracking });
    } catch (error) {
      console.error("ERROR REGISTRANDO UBICACIÓN:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/trips/:id/clients/:clientRowId/start-visit", (req, res) => {
    try {
      const { id, clientRowId } = req.params;
      const { lat, lng, accuracy, comment } = req.body || {};

      const tripClient = getTripClientRow(id, clientRowId);
      if (!tripClient) return res.status(404).json({ error: "Cliente de gira no encontrado" });

      const tracking = registerTripTracking({
        tripId: Number(id),
        tripClient,
        eventType: "Inicio de visita",
        lat,
        lng,
        accuracy,
        comment,
      });

      db.prepare(`
        UPDATE trip_clients
        SET visit_status = 'En visita',
            visit_started_at = datetime('now'),
            visit_start_lat = ?,
            visit_start_lng = ?,
            visit_distance_meters = ?
        WHERE trip_id = ?
          AND id = ?
      `).run(
        safeNumber(lat),
        safeNumber(lng),
        tracking?.distance_meters || null,
        id,
        clientRowId
      );

      res.json({ success: true, distance_meters: tracking?.distance_meters || null });
    } catch (error) {
      console.error("ERROR INICIANDO VISITA:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post(
    "/api/trips/:id/clients/:clientRowId/finish-visit",
    visitUpload.single("photo"),
    (req, res) => {
      try {
        const { id, clientRowId } = req.params;
        const { lat, lng, accuracy, result, comment } = req.body || {};

        const tripClient = getTripClientRow(id, clientRowId);
        if (!tripClient) return res.status(404).json({ error: "Cliente de gira no encontrado" });

        const photoUrl = req.file ? `/uploads/trip-visits/${req.file.filename}` : "";
        const tracking = registerTripTracking({
          tripId: Number(id),
          tripClient,
          eventType: "Fin de visita",
          lat,
          lng,
          accuracy,
          result,
          comment,
          photoUrl,
        });

        db.prepare(`
          UPDATE trip_clients
          SET visit_status = 'Visitado',
              visit_comment = ?,
              visited_at = datetime('now'),
              visited_lat = ?,
              visited_lng = ?,
              visit_result = ?,
              visit_photo_url = COALESCE(NULLIF(?, ''), visit_photo_url),
              visit_distance_meters = COALESCE(?, visit_distance_meters)
          WHERE trip_id = ?
            AND id = ?
        `).run(
          safeText(comment),
          safeNumber(lat),
          safeNumber(lng),
          safeText(result),
          photoUrl,
          tracking?.distance_meters || null,
          id,
          clientRowId
        );

        res.json({
          success: true,
          photo_url: photoUrl,
          distance_meters: tracking?.distance_meters || null,
        });
      } catch (error) {
        console.error("ERROR FINALIZANDO VISITA:", error);
        res.status(500).json({ error: error.message });
      }
    }
  );

  app.get("/api/trips/:id", (req, res) => {
    try {
      const tripId = req.params.id;

      const trip = db.prepare(`
        SELECT *
        FROM trips
        WHERE id = ?
      `).get(tripId);

      if (!trip) {
        return res.status(404).json({
          error: "Gira no encontrada",
        });
      }

      const clients = db.prepare(`
        SELECT *
        FROM trip_clients
        WHERE trip_id = ?
        ORDER BY COALESCE(visit_order, 999999), cliente
      `).all(tripId);

      const route_summary = buildRouteSummary(trip, clients);

      const tracking = db.prepare(`
        SELECT *
        FROM trip_tracking
        WHERE trip_id = ?
        ORDER BY id DESC
        LIMIT 100
      `).all(tripId);

      res.json({
        trip: {
          ...trip,
          route_total_km: route_summary.total_km,
        },
        clients,
        tracking,
        route_summary,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: error.message,
      });
    }
  });


  app.post("/api/trips/:id/geocode-clients", async (req, res) => {
    try {
      const { id } = req.params;
      const { clientRowId, limit = 25 } = req.body || {};

      const trip = db.prepare(`
        SELECT *
        FROM trips
        WHERE id = ?
      `).get(id);

      if (!trip) {
        return res.status(404).json({
          error: "Gira no encontrada",
        });
      }

      const summary = await geocodeMissingTripClients(Number(id), {
        clientRowId,
        limit,
      });

      res.json({
        success: true,
        ...summary,
      });
    } catch (error) {
      console.error("ERROR GEOCODIFICANDO CLIENTES:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.patch("/api/trips/:id/route-settings", (req, res) => {
    try {
      const { id } = req.params;
      const {
        route_start_name,
        route_start_lat,
        route_start_lng,
        route_return_to_start,
      } = req.body || {};

      const trip = db.prepare(`
        SELECT *
        FROM trips
        WHERE id = ?
      `).get(id);

      if (!trip) {
        return res.status(404).json({
          error: "Gira no encontrada",
        });
      }

      db.prepare(`
        UPDATE trips
        SET
          route_start_name = ?,
          route_start_lat = ?,
          route_start_lng = ?,
          route_return_to_start = ?
        WHERE id = ?
      `).run(
        safeText(route_start_name) || "Punto de salida",
        safeNumber(route_start_lat),
        safeNumber(route_start_lng),
        route_return_to_start === false || route_return_to_start === 0 ? 0 : 1,
        id
      );

      const routeSummary = persistRouteTotal(Number(id));

      res.json({
        success: true,
        route_summary: routeSummary,
      });
    } catch (error) {
      console.error("ERROR ACTUALIZANDO RUTA:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.patch("/api/trips/:id/clients/order", (req, res) => {
    try {
      const { id } = req.params;
      const { clientIds } = req.body || {};

      const trip = db.prepare(`
        SELECT *
        FROM trips
        WHERE id = ?
      `).get(id);

      if (!trip) {
        return res.status(404).json({
          error: "Gira no encontrada",
        });
      }

      if (!Array.isArray(clientIds) || clientIds.length === 0) {
        return res.status(400).json({
          error: "No se recibió orden de clientes.",
        });
      }

      const update = db.prepare(`
        UPDATE trip_clients
        SET visit_order = ?
        WHERE trip_id = ?
          AND id = ?
      `);

      const transaction = db.transaction((ids) => {
        ids.forEach((clientRowId, index) => {
          update.run(index + 1, id, Number(clientRowId));
        });
      });

      transaction(clientIds);

      const clients = db.prepare(`
        SELECT *
        FROM trip_clients
        WHERE trip_id = ?
        ORDER BY COALESCE(visit_order, 999999), cliente
      `).all(id);

      const routeSummary = persistRouteTotal(Number(id));

      res.json({
        success: true,
        clients,
        route_summary: routeSummary,
      });
    } catch (error) {
      console.error("ERROR ORDENANDO CLIENTES:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.patch("/api/trips/:id/clients/:clientRowId/location", (req, res) => {
    try {
      const { id, clientRowId } = req.params;
      const {
        partner_latitude,
        partner_longitude,
        direccion,
        localidad,
        provincia,
        codigo_postal,
        address_partner_id,
        address_label,
        address_type,
      } = req.body || {};

      const tripClient = db.prepare(`
        SELECT *
        FROM trip_clients
        WHERE trip_id = ?
          AND id = ?
      `).get(id, clientRowId);

      if (!tripClient) {
        return res.status(404).json({
          error: "Cliente de gira no encontrado",
        });
      }

      const lat = safeNumber(partner_latitude);
      const lng = safeNumber(partner_longitude);
      const hasCoords = hasValidCoords(lat, lng);

      db.prepare(`
        UPDATE trip_clients
        SET
          partner_latitude = ?,
          partner_longitude = ?,
          direccion = ?,
          localidad = ?,
          provincia = ?,
          codigo_postal = ?,
          address_partner_id = COALESCE(?, address_partner_id),
          address_label = COALESCE(NULLIF(?, ''), address_label),
          address_type = COALESCE(NULLIF(?, ''), address_type)
        WHERE trip_id = ?
          AND id = ?
      `).run(
        hasCoords ? lat : null,
        hasCoords ? lng : null,
        safeText(direccion),
        safeText(localidad),
        safeText(provincia),
        safeText(codigo_postal),
        safeNumber(address_partner_id),
        safeText(address_label),
        safeText(address_type),
        id,
        clientRowId
      );

      const updated = db.prepare(`
        SELECT *
        FROM trip_clients
        WHERE trip_id = ?
          AND id = ?
      `).get(id, clientRowId);

      const routeSummary = persistRouteTotal(Number(id));

      res.json({
        success: true,
        client: updated,
        route_summary: routeSummary,
      });
    } catch (error) {
      console.error("ERROR GUARDANDO UBICACION CLIENTE:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.post("/api/trips/visit", (req, res) => {
    try {
      const {
        trip_id,
        cliente_id,
        comentario,
        lat,
        lng,
      } = req.body;

      db.prepare(`
        UPDATE trip_clients
        SET
          visit_status = 'Visitado',
          visit_comment = ?,
          visited_at = datetime('now'),
          visited_lat = ?,
          visited_lng = ?
        WHERE trip_id = ?
        AND cliente_id = ?
      `).run(
        safeText(comentario),
        lat,
        lng,
        trip_id,
        cliente_id
      );

      res.json({
        success: true,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.post("/api/trips/close", (req, res) => {
    try {
      const {
        trip_id,
        pedidos,
        monto,
        observaciones,
        user,
      } = req.body;

      const trip = db.prepare(`
        SELECT *
        FROM trips
        WHERE id = ?
      `).get(trip_id);

      if (!trip) {
        return res.status(404).json({
          error: "Gira no encontrada",
        });
      }

      db.prepare(`
        UPDATE trips
        SET
          status = 'Pendiente revisión',
          result_orders_count = ?,
          result_estimated_amount = ?,
          result_notes = ?,
          closed_at = datetime('now')
        WHERE id = ?
      `).run(
        Number(pedidos || 0),
        Number(monto || 0),
        safeText(observaciones),
        trip_id
      );

      const supervisors = db.prepare(`
        SELECT name
        FROM users
        WHERE active = 1
          AND role IN ('admin', 'supervisor', 'gerente', 'jefe')
      `).all();

      supervisors.forEach((supervisor) => {
        notifyUser(
          supervisor.name,
          "Gira pendiente de revisión",
          `${trip.asesor} cerró la gira ${trip.nombre}. Revisá resultados y devolución.`,
          trip_id
        );
      });

      res.json({
        success: true,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: error.message,
      });
    }
  });

  app.post("/api/trips/:id/review", (req, res) => {
    try {
      const { id } = req.params;
      const {
        supervisor_status,
        supervisor_comments,
        supervisor,
      } = req.body;

      const trip = db.prepare(`
        SELECT *
        FROM trips
        WHERE id = ?
      `).get(id);

      if (!trip) {
        return res.status(404).json({
          error: "Gira no encontrada",
        });
      }

      const finalStatus =
        supervisor_status === "Aprobada" ? "Cerrada" : "Pendiente corrección";

      db.prepare(`
        UPDATE trips
        SET
          status = ?,
          supervisor_status = ?,
          supervisor_comments = ?,
          supervisor_reviewed_by = ?,
          supervisor_reviewed_at = datetime('now')
        WHERE id = ?
      `).run(
        finalStatus,
        safeText(supervisor_status) || "Aprobada",
        safeText(supervisor_comments),
        safeText(supervisor),
        id
      );

      notifyUser(
        trip.asesor,
        "Revisión de gira",
        `${supervisor || "Supervisor"} revisó la gira ${trip.nombre}: ${supervisor_status}.`,
        id
      );

      res.json({
        success: true,
      });
    } catch (error) {
      console.error("ERROR REVIEW TRIP:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  });
};
