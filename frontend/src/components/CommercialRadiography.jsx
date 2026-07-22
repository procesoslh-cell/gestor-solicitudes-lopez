import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const MONTH_NAMES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      "El servidor devolvió una respuesta inválida. Revisá backend/API."
    );
  }
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
}

function formatDate(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("es-AR");
  } catch {
    return value;
  }
}

function getMonthsWithoutSales(row, months) {
  if (!row?.months || !Array.isArray(months) || months.length === 0) return null;

  let count = 0;

  for (let i = months.length - 1; i >= 0; i -= 1) {
    if (row.months[months[i]]) break;
    count += 1;
  }

  return count;
}

export default function CommercialRadiography({ user }) {
  const [loading, setLoading] = useState(false);
  const [months, setMonths] = useState([]);
  const [data, setData] = useState([]);
  const [asesores, setAsesores] = useState([]);
  const [trips, setTrips] = useState([]);
  const [selectedAsesor, setSelectedAsesor] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileClient, setProfileClient] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [profileMonth, setProfileMonth] = useState(null);
  const [noSaleMonth, setNoSaleMonth] = useState(null);

  const [tripModalClient, setTripModalClient] = useState(null);
  const [tripSaving, setTripSaving] = useState(false);
  const [tripForm, setTripForm] = useState({
    mode: "existing",
    trip_id: "",
    nombre: "",
    mes: "",
    start_date: "",
    end_date: "",
    objetivo: "Reactivación comercial",
    prioridad: "Media",
    observaciones: "",
  });

  const isSeller = user?.role === "vendedor";
  const canManageTrips = Boolean(user);

  useEffect(() => {
    loadTrips();

    if (isSeller) {
      loadData();
    } else {
      loadAsesores();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTrips() {
    try {
      const params = new URLSearchParams();
      params.append("role", user?.role || "");

      if (isSeller && user?.odoo_user_id) {
        params.append("odooUserId", user.odoo_user_id);
      }

      const response = await fetch(`${API_URL}/api/trips?${params.toString()}`);
      const json = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(json?.error || "No se pudieron cargar las giras.");
      }

      setTrips(Array.isArray(json) ? json : []);
    } catch (error) {
      console.error(error);
      setTrips([]);
    }
  }

  async function loadAsesores() {
    try {
      setError("");

      const response = await fetch(`${API_URL}/api/odoo/asesores`);
      const json = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(json?.error || "No se pudieron cargar los asesores.");
      }

      setAsesores(Array.isArray(json) ? json : []);
    } catch (error) {
      console.error(error);
      setAsesores([]);
      setError(error.message || "No se pudieron cargar los asesores.");
    }
  }

  async function loadData() {
    if (!isSeller && !selectedAsesor) {
      setError("Seleccioná un asesor para cargar la radiografía.");
      setData([]);
      setMonths([]);
      return;
    }

    if (isSeller && !user?.odoo_user_id) {
      setError("Tu usuario no tiene vendedor Odoo vinculado.");
      setData([]);
      setMonths([]);
      return;
    }

    try {
      setLoading(true);
      setError("");

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
      const json = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(
          json?.error || "No se pudo cargar la radiografía. Revisá Odoo."
        );
      }

      setMonths(Array.isArray(json?.months) ? json.months : []);
      setData(Array.isArray(json?.data) ? json.data : []);
    } catch (error) {
      console.error(error);
      setMonths([]);
      setData([]);
      setError(error.message || "Error cargando radiografía.");
    } finally {
      setLoading(false);
    }
  }

  async function openClientProfile(client, month = null) {
    try {
      setProfileClient(client);
      setProfileMonth(month);
      setNoSaleMonth(null);
      setClientProfile(null);
      setProfileLoading(true);

      const params = new URLSearchParams();
      if (month) params.append("month", month);

      const response = await fetch(
        `${API_URL}/api/comercial/clientes/${client.cliente_id}/perfil${
          params.toString() ? `?${params.toString()}` : ""
        }`
      );
      const json = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(json?.error || "No se pudo cargar el perfil comercial.");
      }

      setClientProfile(json);
    } catch (error) {
      console.error(error);
      alert(error.message || "Error cargando perfil comercial.");
    } finally {
      setProfileLoading(false);
    }
  }

  function getDefaultMonth() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function getDefaultDate(offsetDays = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  }

  function openMonthCommercialDetail(client, month, hasSales) {
    if (hasSales) {
      openClientProfile(client, month);
      return;
    }

    setNoSaleMonth({ client, month });
  }

  function openTripModal(client, sourceMonth = null) {
    const monthsWithoutSales = getMonthsWithoutSales(client, safeMonths);
    const defaultObjective =
      monthsWithoutSales !== null && monthsWithoutSales >= 3
        ? "Reactivación por inactividad"
        : "Visita comercial programada";

    const defaultPriority =
      monthsWithoutSales !== null && monthsWithoutSales >= 3 ? "Alta" : "Media";

    const availableTrips = getAvailableTripsForClient(client);

    setTripModalClient(client);
    setTripForm({
      mode: availableTrips.length > 0 ? "existing" : "new",
      trip_id: availableTrips[0]?.id ? String(availableTrips[0].id) : "",
      nombre: `Gira ${client.asesor || user?.name || "comercial"} - ${formatMonth(getDefaultMonth())}`,
      mes: getDefaultMonth(),
      start_date: getDefaultDate(1),
      end_date: getDefaultDate(1),
      objetivo: defaultObjective,
      prioridad: defaultPriority,
      observaciones: sourceMonth
        ? `Cliente agregado desde radiografía. Mes revisado: ${formatMonth(sourceMonth)}.`
        : `Cliente agregado desde radiografía comercial. Meses sin compra: ${monthsWithoutSales ?? "-"}.`,
    });
  }

  function closeTripModal() {
    setTripModalClient(null);
  }

  function getAvailableTripsForClient(client) {
    const closedStatuses = ["Cerrada", "Cancelada"];

    return trips.filter((trip) => {
      const sameAsesor =
        String(trip.asesor_id || "") === String(client?.asesor_id || "");
      const isClosed =
        closedStatuses.includes(trip.status) ||
        closedStatuses.includes(trip.supervisor_status);

      return sameAsesor && !isClosed;
    });
  }

  async function saveTripAssignment(event) {
    event.preventDefault();

    if (!tripModalClient) return;

    try {
      setTripSaving(true);

      let response;

      const payloadClient = {
        cliente_id: tripModalClient.cliente_id,
        cliente: tripModalClient.cliente,
        estado: tripModalClient.estado,
        partner_latitude: tripModalClient.partner_latitude,
        partner_longitude: tripModalClient.partner_longitude,
        direccion:
          tripModalClient.direccion ||
          [tripModalClient.street, tripModalClient.street2].filter(Boolean).join(" "),
        localidad: tripModalClient.localidad || tripModalClient.city || "",
        provincia:
          tripModalClient.provincia ||
          tripModalClient.state ||
          tripModalClient.state_name ||
          "",
        codigo_postal: tripModalClient.codigo_postal || tripModalClient.zip || "",
        objetivo: tripForm.objetivo,
        prioridad: tripForm.prioridad,
        source: "Radiografía comercial",
        created_by: user?.name || "Sistema",
      };

      if (tripForm.mode === "existing") {
        if (!tripForm.trip_id) {
          throw new Error("Seleccioná una gira existente.");
        }

        response = await fetch(`${API_URL}/api/trips/${tripForm.trip_id}/clients`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadClient),
        });
      } else {
        const asesorId = isSeller ? user?.odoo_user_id : tripModalClient.asesor_id;
        const asesorName = isSeller ? user?.name : tripModalClient.asesor;

        if (!asesorId || !asesorName) {
          throw new Error("El cliente no tiene asesor Odoo vinculado.");
        }

        if (!tripForm.nombre || !tripForm.mes || !tripForm.start_date || !tripForm.end_date) {
          throw new Error("Completá nombre, mes, fecha de inicio y fecha de fin.");
        }

        if (new Date(tripForm.end_date) < new Date(tripForm.start_date)) {
          throw new Error("La fecha de fin no puede ser anterior a la fecha de inicio.");
        }

        response = await fetch(`${API_URL}/api/trips`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asesor_id: Number(asesorId),
            asesor: asesorName,
            nombre: tripForm.nombre,
            mes: tripForm.mes,
            observaciones: `${tripForm.observaciones}\nObjetivo: ${tripForm.objetivo}. Prioridad: ${tripForm.prioridad}.`,
            start_date: tripForm.start_date,
            end_date: tripForm.end_date,
            clientes: [payloadClient],
          }),
        });
      }

      const json = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(json?.error || "No se pudo agregar el cliente a la gira.");
      }

      alert(
        json?.alreadyExists
          ? "El cliente ya estaba agregado a esa gira."
          : "Cliente agregado a la gira comercial."
      );

      setTripModalClient(null);
      await loadTrips();
    } catch (error) {
      console.error(error);
      alert(error.message || "Error agregando cliente a gira.");
    } finally {
      setTripSaving(false);
    }
  }

  function formatMonth(monthKey) {
    if (!monthKey || typeof monthKey !== "string") return "-";

    const [year, month] = monthKey.split("-");
    const monthIndex = Number(month) - 1;

    return `${MONTH_NAMES[monthIndex] || month} ${String(year).slice(2)}`;
  }

  const safeData = Array.isArray(data) ? data : [];
  const safeMonths = Array.isArray(months) ? months : [];
  const safeAsesores = Array.isArray(asesores) ? asesores : [];


  const filteredData = useMemo(() => {
    const value = search.toLowerCase();

    return safeData.filter((item) => {
      return (
        (item.cliente || "").toLowerCase().includes(value) ||
        (item.asesor || "").toLowerCase().includes(value) ||
        (item.estado || "").toLowerCase().includes(value)
      );
    });
  }, [safeData, search]);

  const totalClientes = safeData.length;
  const totalActivos = safeData.filter((item) => item.estado === "Activo").length;
  const totalInactivos = safeData.filter(
    (item) => item.estado === "Inactivo"
  ).length;

  const clientesSinCompra3M = safeData.filter((item) => {
    const monthsWithoutSales = getMonthsWithoutSales(item, safeMonths);
    return monthsWithoutSales !== null && monthsWithoutSales >= 3;
  }).length;

  function exportCSV() {
    const headers = [
      "Cliente",
      "Asesor",
      ...safeMonths.map(formatMonth),
      "Estado",
      "Meses sin compra",
      "Total 12M",
    ];

    const rows = filteredData.map((row) => [
      row.cliente,
      row.asesor,
      ...safeMonths.map((month) => (row.months?.[month] ? "SI" : "NO")),
      row.estado,
      getMonthsWithoutSales(row, safeMonths),
      row.totalFacturas12m,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `radiografia-comercial-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  return (
    <div className="radiography-page">
      <div className="radiography-header">
        <div>
          <h1>Radiografía Comercial</h1>

          <p>
            {isSeller
              ? "Tu cartera con historial comercial, actividad, inactividad y perfil por cliente."
              : "Cartera por asesor con historial, perfil comercial y planificación de giras."}
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={exportCSV}
          disabled={filteredData.length === 0}
        >
          Descargar CSV
        </button>
      </div>

      <div className="radiography-filters">
        {!isSeller && (
          <>
            <select
              className="status-filter"
              value={selectedAsesor}
              onChange={(event) => {
                setSelectedAsesor(event.target.value);
                setData([]);
                setMonths([]);
                setError("");
              }}
            >
              <option value="">Seleccionar asesor</option>

              {safeAsesores.map((asesor) => (
                <option key={asesor.asesor_id} value={asesor.asesor_id}>
                  {asesor.asesor}
                </option>
              ))}
            </select>

            <button className="primary-button" onClick={loadData}>
              Cargar radiografía
            </button>
          </>
        )}

        {isSeller && (
          <button className="primary-button" onClick={loadData}>
            Actualizar mi radiografía
          </button>
        )}

        <input
          className="search-input"
          type="text"
          placeholder="Buscar cliente, asesor o estado..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error && <div className="radiography-error">{error}</div>}

      <div className="radiography-stats radiography-stats-extended">
        <div className="stat-card">
          <span>Total cartera</span>
          <strong>{totalClientes}</strong>
        </div>

        <div className="stat-card">
          <span>Clientes activos</span>
          <strong>{totalActivos}</strong>
        </div>

        <div className="stat-card">
          <span>Clientes inactivos</span>
          <strong>{totalInactivos}</strong>
        </div>

        <div className="stat-card">
          <span>Sin compra +3M</span>
          <strong>{clientesSinCompra3M}</strong>
        </div>
      </div>

      <div className="radiography-table-wrapper">
        <table className="radiography-table radiography-table-actions">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Asesor</th>

              {safeMonths.map((month) => (
                <th key={month}>{formatMonth(month)}</th>
              ))}

              <th>Estado</th>
              <th>Sin compra</th>
              <th>12M</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={safeMonths.length + 6}>Cargando radiografía...</td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={safeMonths.length + 6}>
                  {error
                    ? "No se pudo cargar la información comercial."
                    : isSeller
                    ? "No hay datos para tu cartera o tu usuario no tiene vendedor Odoo vinculado."
                    : "Seleccioná un asesor y presioná “Cargar radiografía”."}
                </td>
              </tr>
            ) : (
              filteredData.map((item) => {
                const monthsWithoutSales = getMonthsWithoutSales(item, safeMonths);
                const canReactivate = monthsWithoutSales !== null && monthsWithoutSales >= 3;

                return (
                  <tr key={item.cliente_id || item.cliente}>
                    <td>
                      <div className="radiography-client-cell">
                        <strong>{item.cliente || "-"}</strong>
                        <span>ID Odoo: {item.cliente_id || "-"}</span>
                      </div>
                    </td>

                    <td>{item.asesor || "-"}</td>

                    {safeMonths.map((month) => {
                      const hasSales = Boolean(item.months?.[month]);

                      return (
                        <td key={month} className="month-cell">
                          <button
                            type="button"
                            className={`month-status-button ${
                              hasSales ? "has-sales" : "no-sales"
                            }`}
                            title={
                              hasSales
                                ? `Ver ventas de ${formatMonth(month)}`
                                : `Sin ventas en ${formatMonth(month)}`
                            }
                            onClick={() =>
                              openMonthCommercialDetail(item, month, hasSales)
                            }
                          >
                            {hasSales ? "✅" : "❌"}
                          </button>
                        </td>
                      );
                    })}

                    <td>
                      <span
                        className={
                          item.estado === "Activo"
                            ? "status-active"
                            : "status-inactive"
                        }
                      >
                        {item.estado || "Sin estado"}
                      </span>
                    </td>

                    <td>
                      <span
                        className={
                          canReactivate
                            ? "radiography-risk-pill high"
                            : "radiography-risk-pill"
                        }
                      >
                        {monthsWithoutSales ?? "-"} meses
                      </span>
                    </td>

                    <td>{item.totalFacturas12m || 0}</td>

                    <td>
                      <div className="radiography-actions">
                        <button
                          className="view-btn"
                          onClick={() => openClientProfile(item)}
                        >
                          Ver perfil
                        </button>

                        {canManageTrips && (
                          <button
                            className={
                              canReactivate
                                ? "primary-mini-button"
                                : "secondary-mini-button"
                            }
                            onClick={() => openTripModal(item)}
                          >
                            Agregar a gira
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {profileClient && (
        <div className="modal-overlay">
          <div className="modal detail-modal client-profile-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">
                  {profileMonth ? `Detalle mensual · ${formatMonth(profileMonth)}` : "Perfil comercial"}
                </p>
                <h2>{profileClient.cliente}</h2>
                <p>
                  {profileMonth
                    ? "Facturas, productos y resumen del mes seleccionado."
                    : "Historial, categorías, deuda y pedidos recientes."}
                </p>
              </div>

              <button
                onClick={() => {
                  setProfileClient(null);
                  setClientProfile(null);
                  setProfileMonth(null);
                }}
              >
                ×
              </button>
            </div>

            {profileLoading ? (
              <div className="empty-box">Cargando perfil comercial...</div>
            ) : (
              <div className="request-top-grid">
                <div className="request-main-info">
                  <div className="detail-section">
                    <h3>Resumen comercial</h3>

                    <div className="detail-grid">
                      <div className="detail-box">
                        <strong>Cliente</strong>
                        <p>{clientProfile?.cliente?.cliente || profileClient.cliente}</p>
                      </div>

                      <div className="detail-box">
                        <strong>Asesor</strong>
                        <p>{clientProfile?.cliente?.asesor || profileClient.asesor || "-"}</p>
                      </div>

                      <div className="detail-box">
                        <strong>{profileMonth ? "Total del mes" : "Total 12M"}</strong>
                        <p>{formatMoney(clientProfile?.resumen?.total12m)}</p>
                      </div>

                      <div className="detail-box">
                        <strong>Categoría principal</strong>
                        <p>{clientProfile?.resumen?.categoriaPrincipal || "-"}</p>
                      </div>

                      <div className="detail-box">
                        <strong>Condición de pago</strong>
                        <p>{clientProfile?.resumen?.condicionPago || "-"}</p>
                      </div>

                      <div className="detail-box">
                        <strong>Deuda pendiente</strong>
                        <p>{formatMoney(clientProfile?.resumen?.deudaPendiente)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <h3>{profileMonth ? "Compras por categoría del mes" : "Compras por categoría"}</h3>

                    <div className="profile-table-wrapper">
                      <table className="profile-table">
                        <thead>
                          <tr>
                            <th>Categoría</th>
                            <th>Facturas</th>
                            <th>Unidades</th>
                            <th>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(clientProfile?.categorias || []).length === 0 ? (
                            <tr>
                              <td colSpan="4">Sin datos de categorías.</td>
                            </tr>
                          ) : (
                            clientProfile.categorias.map((item) => (
                              <tr key={item.categoria}>
                                <td>{item.categoria}</td>
                                <td>{item.facturas || 0}</td>
                                <td>{Number(item.unidades || 0).toLocaleString("es-AR")}</td>
                                <td>{formatMoney(item.monto)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="detail-section">
                    <h3>{profileMonth ? "Productos vendidos del mes" : "Productos más vendidos"}</h3>

                    <div className="profile-table-wrapper">
                      <table className="profile-table">
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Producto</th>
                            <th>Categoría</th>
                            <th>Unidades</th>
                            <th>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(clientProfile?.productos || []).length === 0 ? (
                            <tr>
                              <td colSpan="5">Sin detalle de productos.</td>
                            </tr>
                          ) : (
                            clientProfile.productos.map((item, index) => (
                              <tr key={`${item.sku || "sku"}-${item.producto || index}`}>
                                <td>{item.sku || "-"}</td>
                                <td>{item.producto || "-"}</td>
                                <td>{item.categoria || "-"}</td>
                                <td>{Number(item.unidades || 0).toLocaleString("es-AR")}</td>
                                <td>{formatMoney(item.monto)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="detail-section">
                    <h3>{profileMonth ? "Facturas del mes" : "Últimas compras"}</h3>

                    <div className="profile-table-wrapper">
                      <table className="profile-table">
                        <thead>
                          <tr>
                            <th>Factura</th>
                            <th>Fecha</th>
                            <th>Monto</th>
                            <th>Pago</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(clientProfile?.ultimasCompras || []).length === 0 ? (
                            <tr>
                              <td colSpan="4">Sin compras recientes.</td>
                            </tr>
                          ) : (
                            clientProfile.ultimasCompras.map((item) => (
                              <tr key={item.factura_id || item.factura}>
                                <td>{item.factura}</td>
                                <td>{formatDate(item.fecha)}</td>
                                <td>{formatMoney(item.monto)}</td>
                                <td>{item.payment_state || "-"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="request-side-panel">
                  <div className="side-card">
                    <h3>Acciones comerciales</h3>

                    <button
                      className="primary-button"
                      style={{ width: "100%" }}
                      onClick={() => openTripModal(profileClient, profileMonth)}
                    >
                      Agregar a gira comercial
                    </button>

                    <p className="collection-helper">
                      Sumá este cliente a una gira existente o creá una nueva
                      para programar la visita del asesor.
                    </p>
                  </div>

                  <div className="side-card">
                    <h3>Pedidos y presupuestos recientes</h3>

                    <div className="timeline-list">
                      {(clientProfile?.presupuestos || []).length === 0 ? (
                        <div className="empty-box">Sin pedidos o presupuestos recientes.</div>
                      ) : (
                        clientProfile.presupuestos.map((item) => (
                          <div className="timeline-item" key={item.presupuesto_id}>
                            <strong>{item.presupuesto}</strong>
                            <p>{formatMoney(item.monto)} · {item.state}</p>
                            <span>{formatDate(item.fecha)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {noSaleMonth && (
        <div className="modal-overlay">
          <div className="modal small-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Mes sin compra · {formatMonth(noSaleMonth.month)}</p>
                <h2>{noSaleMonth.client.cliente}</h2>
                <p>
                  No se registran facturas en el mes seleccionado. Podés usar este
                  dato para sumar el cliente a una gira de recuperación.
                </p>
              </div>

              <button onClick={() => setNoSaleMonth(null)}>×</button>
            </div>

            <div className="detail-section">
              <div className="detail-grid">
                <div className="detail-box">
                  <strong>Cliente</strong>
                  <p>{noSaleMonth.client.cliente}</p>
                </div>

                <div className="detail-box">
                  <strong>Asesor</strong>
                  <p>{noSaleMonth.client.asesor || "-"}</p>
                </div>

                <div className="detail-box">
                  <strong>Estado</strong>
                  <p>{noSaleMonth.client.estado || "-"}</p>
                </div>

                <div className="detail-box">
                  <strong>Mes</strong>
                  <p>{formatMonth(noSaleMonth.month)}</p>
                </div>
              </div>
            </div>

            <div className="modal-footer full">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setNoSaleMonth(null)}
              >
                Cerrar
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const client = noSaleMonth.client;
                  const month = noSaleMonth.month;
                  setNoSaleMonth(null);
                  openTripModal(client, month);
                }}
              >
                Agregar a gira
              </button>
            </div>
          </div>
        </div>
      )}

      {tripModalClient && (
        <div className="modal-overlay">
          <div className="modal small-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Agregar a gira comercial</p>
                <h2>{tripModalClient.cliente}</h2>
                <p>
                  Seleccioná una gira existente del asesor o creá una nueva para
                  programar la visita.
                </p>
              </div>

              <button onClick={closeTripModal}>×</button>
            </div>

            <form className="form-grid" onSubmit={saveTripAssignment}>
              <label className="full">
                Acción
                <select
                  value={tripForm.mode}
                  onChange={(event) =>
                    setTripForm({ ...tripForm, mode: event.target.value })
                  }
                >
                  <option value="existing">Agregar a gira existente</option>
                  <option value="new">Crear nueva gira</option>
                </select>
              </label>

              {tripForm.mode === "existing" ? (
                <label className="full">
                  Gira comercial
                  <select
                    value={tripForm.trip_id}
                    onChange={(event) =>
                      setTripForm({ ...tripForm, trip_id: event.target.value })
                    }
                    required
                  >
                    <option value="">Seleccionar gira</option>

                    {getAvailableTripsForClient(tripModalClient).map((trip) => (
                      <option key={trip.id} value={trip.id}>
                        {trip.nombre} · {formatDate(trip.start_date)} → {formatDate(trip.end_date)}
                      </option>
                    ))}
                  </select>

                  {getAvailableTripsForClient(tripModalClient).length === 0 && (
                    <span className="form-helper">
                      No hay giras abiertas para este asesor. Cambiá a “Crear nueva gira”.
                    </span>
                  )}
                </label>
              ) : (
                <>
                  <label className="full">
                    Nombre de gira
                    <input
                      value={tripForm.nombre}
                      onChange={(event) =>
                        setTripForm({ ...tripForm, nombre: event.target.value })
                      }
                      required
                    />
                  </label>

                  <label>
                    Mes
                    <input
                      type="month"
                      value={tripForm.mes}
                      onChange={(event) =>
                        setTripForm({ ...tripForm, mes: event.target.value })
                      }
                      required
                    />
                  </label>

                  <label>
                    Inicio
                    <input
                      type="date"
                      value={tripForm.start_date}
                      onChange={(event) =>
                        setTripForm({ ...tripForm, start_date: event.target.value })
                      }
                      required
                    />
                  </label>

                  <label>
                    Fin
                    <input
                      type="date"
                      value={tripForm.end_date}
                      onChange={(event) =>
                        setTripForm({ ...tripForm, end_date: event.target.value })
                      }
                      required
                    />
                  </label>
                </>
              )}

              <label>
                Prioridad
                <select
                  value={tripForm.prioridad}
                  onChange={(event) =>
                    setTripForm({ ...tripForm, prioridad: event.target.value })
                  }
                >
                  <option>Alta</option>
                  <option>Media</option>
                  <option>Baja</option>
                </select>
              </label>

              <label className="full">
                Objetivo de visita
                <select
                  value={tripForm.objetivo}
                  onChange={(event) =>
                    setTripForm({ ...tripForm, objetivo: event.target.value })
                  }
                >
                  <option>Reactivación por inactividad</option>
                  <option>Visita comercial programada</option>
                  <option>Cobranza</option>
                  <option>Presentar línea nueva</option>
                  <option>Reclamo / seguimiento</option>
                  <option>Otro</option>
                </select>
              </label>

              <label className="full">
                Observación
                <textarea
                  value={tripForm.observaciones}
                  onChange={(event) =>
                    setTripForm({ ...tripForm, observaciones: event.target.value })
                  }
                />
              </label>

              <div className="modal-footer full">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeTripModal}
                >
                  Cancelar
                </button>

                <button className="primary-button" disabled={tripSaving}>
                  {tripSaving ? "Guardando..." : "Guardar en gira"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
