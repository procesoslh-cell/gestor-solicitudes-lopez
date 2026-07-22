import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const UNITS = {
  ciclismo: {
    label: "Ciclismo",
    categories: [
      { key: "bicicletas", label: "Bicicletas" },
      { key: "bicipartes", label: "Bicipartes" },
    ],
  },
  motociclismo: {
    label: "Motociclismo",
    categories: [
      { key: "mix", label: "MIX" },
      { key: "neumaticos", label: "Neumáticos" },
    ],
  },
};

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function money(value) {
  return Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

function chipClass(status) {
  if (status === "Cumplido") return "green";
  if (status === "Proyecta cumplir") return "blue";
  if (status === "En seguimiento") return "yellow";
  if (status === "A reforzar") return "orange";
  return "red";
}

function normalizeObjectiveRows(rows, unit) {
  const categories = UNITS[unit].categories;
  return (rows || []).map((row) => {
    const normalized = {
      advisorId: row.advisorId || row.advisor_id || null,
      advisor: row.advisor || row.advisor_name || "Sin asesor",
    };

    categories.forEach((category) => {
      normalized[category.key] = Number(row.categories?.[category.key]?.objective || row[category.key] || 0);
    });
    normalized.clientsObjective = Number(row.clientsObjective || row.objetivoClientes || row.clientes_vendidos || 0);

    return normalized;
  });
}

export default function CommercialObjectives({ user }) {
  const [unit, setUnit] = useState("ciclismo");
  const [period, setPeriod] = useState(currentPeriod());
  const [advisorFilter, setAdvisorFilter] = useState("");
  const [advisorFilterKeys, setAdvisorFilterKeys] = useState([]);
  const [advisorSearch, setAdvisorSearch] = useState("");
  const [data, setData] = useState({ kpis: {}, rows: [], categories: UNITS.ciclismo.categories, warnings: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showObjectives, setShowObjectives] = useState(false);
  const [objectiveRows, setObjectiveRows] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditData, setAuditData] = useState({
    totals: {},
    summary: [],
    clients: [],
    detail: [],
    projected: { totals: {}, orders: [], detail: [] },
  });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditBucket, setAuditBucket] = useState("");
  const [auditListType, setAuditListType] = useState("");
  const [auditLimit, setAuditLimit] = useState(500);

  const canManageObjectives = ["admin", "supervisor", "gerente", "jefe"].includes(user?.role);
  const unitConfig = UNITS[unit];

  useEffect(() => {
    loadData();
  }, [unit, period, advisorFilter, advisorFilterKeys.join("|")]);

  useEffect(() => {
    if (user?.role !== "vendedor") loadAdvisors();
  }, [user?.role]);

  useEffect(() => {
    if (showAudit) loadAudit();
  }, [showAudit, unit, period, advisorFilter, advisorFilterKeys.join("|"), auditBucket, auditListType, auditLimit]);


  function advisorKey(advisor) {
    if (!advisor) return "";
    return advisor.id ? `id:${advisor.id}` : `name:${advisor.name}`;
  }

  function selectedAdvisorLabel() {
    if (user?.role === "vendedor") return user?.name || "Mi usuario";
    if (!advisorFilterKeys.length) return "Todos los asesores";
    if (advisorFilterKeys.length === 1) {
      const key = advisorFilterKeys[0];
      if (String(key).startsWith("id:")) {
        const id = String(key).slice(3);
        return advisors.find((item) => String(item.id) === String(id))?.name || "1 asesor seleccionado";
      }
      return String(key).replace(/^name:/, "");
    }
    return `${advisorFilterKeys.length} asesores seleccionados`;
  }

  function setAdvisorSelection(key) {
    const next = key ? [key] : [];
    setAdvisorFilterKeys(next);
    if (!key) {
      setAdvisorFilter("");
      return;
    }
    if (String(key).startsWith("id:")) {
      const id = String(key).slice(3);
      const advisor = advisors.find((item) => String(item.id) === String(id));
      setAdvisorFilter(advisor?.name || "");
      return;
    }
    setAdvisorFilter(String(key).replace(/^name:/, ""));
  }

  function toggleAdvisorSelection(key) {
    setAdvisorFilterKeys((current) => {
      const exists = current.includes(key);
      const next = exists ? current.filter((item) => item !== key) : [...current, key];
      if (!next.length) setAdvisorFilter("");
      else if (next.length === 1) {
        const only = next[0];
        if (String(only).startsWith("id:")) {
          const id = String(only).slice(3);
          const advisor = advisors.find((item) => String(item.id) === String(id));
          setAdvisorFilter(advisor?.name || "");
        } else {
          setAdvisorFilter(String(only).replace(/^name:/, ""));
        }
      } else {
        setAdvisorFilter("");
      }
      return next;
    });
  }

  function clearAdvisorSelection() {
    setAdvisorFilterKeys([]);
    setAdvisorFilter("");
    setAdvisorSearch("");
  }

  function applyAdvisorParams(params) {
    if (advisorFilterKeys.length) {
      const ids = [];
      const names = [];
      advisorFilterKeys.forEach((key) => {
        if (String(key).startsWith("id:")) ids.push(String(key).slice(3));
        else names.push(String(key).replace(/^name:/, ""));
      });
      if (ids.length) params.set("advisorIds", ids.join(","));
      if (names.length) params.set("advisorNames", names.join("||"));
      return;
    }
    if (advisorFilter) params.set("advisorName", advisorFilter);
  }

  function renderAdvisorMultiSelect() {
    const query = advisorSearch.trim().toLowerCase();
    const filtered = advisors.filter((advisor) => !query || advisor.name.toLowerCase().includes(query));
    return (
      <details className="advisor-multi-select">
        <summary>{selectedAdvisorLabel()}</summary>
        <div className="advisor-multi-menu" onClick={(event) => event.stopPropagation()}>
          <input
            type="search"
            value={advisorSearch}
            onChange={(event) => setAdvisorSearch(event.target.value)}
            placeholder="Buscar asesor..."
            disabled={user?.role === "vendedor"}
          />
          <label className="advisor-check-row">
            <input type="checkbox" checked={!advisorFilterKeys.length} onChange={clearAdvisorSelection} disabled={user?.role === "vendedor"} />
            Todos los asesores
          </label>
          <div className="advisor-multi-list">
            {filtered.map((advisor) => {
              const key = advisorKey(advisor);
              return (
                <label className="advisor-check-row" key={key}>
                  <input
                    type="checkbox"
                    checked={advisorFilterKeys.includes(key)}
                    onChange={() => toggleAdvisorSelection(key)}
                    disabled={user?.role === "vendedor"}
                  />
                  {advisor.name}
                </label>
              );
            })}
            {filtered.length === 0 && <span className="advisor-empty">Sin asesores para ese filtro.</span>}
          </div>
          {advisorFilterKeys.length > 0 && (
            <button type="button" className="link-button clear-advisors" onClick={clearAdvisorSelection}>Limpiar selección</button>
          )}
        </div>
      </details>
    );
  }

  function openAdvisorAudit(row) {
    const key = row?.advisorId ? `id:${row.advisorId}` : `name:${row?.advisor || ""}`;
    setAdvisorSelection(key);
    setShowAudit(true);
    window.setTimeout(() => {
      document.getElementById("objectives-audit-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        unit,
        period,
        role: user?.role || "",
        userName: user?.name || "",
      });

      if (user?.odoo_user_id) params.set("odooUserId", user.odoo_user_id);
      applyAdvisorParams(params);

      const response = await fetch(`${API_URL}/api/commercial-objectives/summary?${params.toString()}`);
      const json = await response.json();

      if (!response.ok) throw new Error(json.error || "No se pudo cargar objetivos comerciales");

      setData({
        kpis: json.kpis || {},
        rows: json.rows || [],
        categories: json.categories || unitConfig.categories,
        warnings: json.warnings || [],
      });
      setObjectiveRows(normalizeObjectiveRows(json.rows || [], unit));
    } catch (err) {
      console.error(err);
      setError(err.message || "Error cargando objetivos comerciales");
    } finally {
      setLoading(false);
    }
  }

  async function loadAdvisors() {
    try {
      const response = await fetch(`${API_URL}/api/commercial-objectives/advisors`);
      const json = await response.json();
      setAdvisors(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error(err);
    }
  }


  async function loadAudit() {
    try {
      setAuditLoading(true);
      setAuditError("");
      const params = new URLSearchParams({
        unit,
        period,
        role: user?.role || "",
        userName: user?.name || "",
        limit: String(auditLimit || 500),
      });
      if (user?.odoo_user_id) params.set("odooUserId", user.odoo_user_id);
      applyAdvisorParams(params);
      if (auditBucket) params.set("bucket", auditBucket);
      if (auditListType) params.set("listType", auditListType);

      const response = await fetch(`${API_URL}/api/commercial-objectives/audit?${params.toString()}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "No se pudo cargar auditoría");
      setAuditData({
        totals: json.totals || {},
        summary: json.summary || [],
        clients: json.clients || [],
        detail: json.detail || [],
        projected: {
          totals: json.projected?.totals || {},
          orders: json.projected?.orders || [],
          detail: json.projected?.detail || [],
        },
      });
    } catch (err) {
      console.error(err);
      setAuditError(err.message || "Error cargando auditoría");
    } finally {
      setAuditLoading(false);
    }
  }

  function downloadAuditCsv(type = "detail") {
    const source = type === "summary"
      ? auditData.summary
      : type === "clients"
      ? auditData.clients
      : type === "projected-orders"
      ? auditData.projected.orders
      : type === "projected-detail"
      ? auditData.projected.detail
      : auditData.detail;
    if (!source?.length) return;
    const headers = Object.keys(source[0]);
    const rows = source.map((row) => headers.map((header) => row[header] ?? ""));
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auditoria-objetivos-${type}-${unit}-${period}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function updateObjective(index, category, value) {
    setObjectiveRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [category]: Number(value || 0) } : row
      )
    );
  }

  function updateClientsObjective(index, value) {
    setObjectiveRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, clientsObjective: Number(value || 0) } : row
      )
    );
  }

  function addAdvisorRow() {
    const advisor = advisors.find((item) => String(item.id || item.name) === String(selectedAdvisorId));
    if (!advisor) return;
    const exists = objectiveRows.some((row) => String(row.advisorId || row.advisor) === String(advisor.id || advisor.name));
    if (exists) return;
    const newRow = { advisorId: advisor.id || null, advisor: advisor.name };
    unitConfig.categories.forEach((category) => {
      newRow[category.key] = 0;
    });
    newRow.clientsObjective = 0;
    setObjectiveRows((current) => [...current, newRow].sort((a, b) => a.advisor.localeCompare(b.advisor)));
    setSelectedAdvisorId("");
  }

  async function saveObjectives() {
    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/api/commercial-objectives/objectives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          unit,
          user: user?.name || "Sistema",
          items: objectiveRows,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "No se pudo guardar objetivos");
      await loadData();
      alert("Objetivos guardados");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error guardando objetivos");
    } finally {
      setSaving(false);
    }
  }

  async function copyPreviousMonth() {
    if (!confirm("¿Copiar objetivos del mes anterior a este período?")) return;
    try {
      const response = await fetch(`${API_URL}/api/commercial-objectives/copy-previous`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, unit, user: user?.name || "Sistema" }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "No se pudo copiar el mes anterior");
      await loadData();
      alert(`Objetivos copiados: ${json.copied || 0}`);
    } catch (err) {
      console.error(err);
      alert(err.message || "Error copiando objetivos");
    }
  }

  function downloadCsv() {
    const headers = [
      "Asesor",
      ...unitConfig.categories.flatMap((category) => [
        `Objetivo ${category.label}`,
        `Venta ${category.label}`,
        `% ${category.label}`,
      ]),
      "Objetivo total",
      "Venta neta total",
      "Venta otros negocios",
      "A facturar",
      "Proyectado",
      "% Cumplimiento",
      "% Proyectado",
      "Clientes vendidos",
      "Objetivo clientes",
      "% clientes",
      "Estado",
    ];

    const rows = data.rows.map((row) => [
      row.advisor,
      ...unitConfig.categories.flatMap((category) => [
        row.categories?.[category.key]?.objective || 0,
        row.categories?.[category.key]?.sale || 0,
        row.categories?.[category.key]?.fulfillment ?? "",
      ]),
      row.objectiveTotal,
      row.salesTotal,
      row.otherBusinessSales || 0,
      row.pendingTotal,
      row.projectedTotal,
      row.fulfillmentTotal ?? "",
      row.projectedPct ?? "",
      row.clients,
      row.clientsObjective || 0,
      row.clientsFulfillment ?? "",
      row.status,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `objetivos-${unit}-${period}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const ranking = useMemo(() => data.rows.slice(0, 5), [data.rows]);

  return (
    <div className="credit-page objectives-page">
      <header className="radiography-header credit-header">
        <div>
          <span className="section-eyebrow">Objetivos comerciales · V6</span>
          <h1>{user?.role === "vendedor" ? "Mi dashboard comercial" : "Dashboard de objetivos comerciales"}</h1>
          <p>
            Replica operativa de la tabla de Power BI para comparar avance mensual por asesor en Ciclismo y Motociclismo.
          </p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={downloadCsv}>Exportar CSV</button>
          <button className="secondary-button" onClick={() => setShowAudit((value) => !value)}>
            {showAudit ? "Ocultar auditoría" : "Auditoría general"}
          </button>
          <button className="secondary-button" onClick={loadData}>Actualizar</button>
          {canManageObjectives && (
            <button className="primary-button" onClick={() => setShowObjectives((value) => !value)}>
              {showObjectives ? "Ocultar carga" : "Cargar objetivos"}
            </button>
          )}
        </div>
      </header>

      <section className="objective-tabs">
        {Object.entries(UNITS).map(([key, config]) => (
          <button key={key} className={unit === key ? "active" : ""} onClick={() => setUnit(key)}>
            {config.label}
          </button>
        ))}
      </section>

      <section className="credit-filters-panel objectives-filters">
        <label>
          Período
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>

        <label>
          Asesor
{renderAdvisorMultiSelect()}
        </label>

        <label>
          Negocio
          <select value={unit} onChange={(event) => setUnit(event.target.value)}>
            <option value="ciclismo">Ciclismo</option>
            <option value="motociclismo">Motociclismo</option>
          </select>
        </label>
      </section>

      {error && <div className="error-banner">{error}</div>}
      {data.warnings?.map((warning) => (
        <div className="error-banner" key={warning}>{warning}</div>
      ))}

      <section className="credit-kpi-grid objectives-kpis">
        <div className="credit-kpi-card dark"><span>Venta neta</span><strong>{money(data.kpis.sales)}</strong></div>
        <div className="credit-kpi-card"><span>Objetivo</span><strong>{money(data.kpis.objective)}</strong></div>
        <div className="credit-kpi-card"><span>% cumplimiento</span><strong>{pct(data.kpis.fulfillment)}</strong></div>
        <div className="credit-kpi-card"><span>A facturar</span><strong>{money(data.kpis.pending)}</strong></div>
        <div className="credit-kpi-card"><span>Proyectado</span><strong>{money(data.kpis.projected)}</strong><small>{pct(data.kpis.projectedPct)}</small></div>
        <div className="credit-kpi-card"><span>Fuera de negocio</span><strong>{money(data.kpis.otherBusinessSales)}</strong><small>Ayuda a explicar diferencias con Power BI</small></div>
        <div className="credit-kpi-card"><span>Clientes vendidos</span><strong>{data.kpis.clients || 0}</strong><small>Obj. {data.kpis.clientsObjective || 0} · {pct(data.kpis.clientsFulfillment)}</small></div>
      </section>


      {showAudit && (
        <section id="objectives-audit-section" className="score-config-card wide objectives-audit">
          <div className="score-config-card-header">
            <div>
              <h3>Auditoría Power BI / Odoo</h3>
              <p>
                Desglose para encontrar diferencias: venta real, clientes y pedidos incluidos en A facturar / Proyectado. El proyectado usa el subtotal sin impuestos de cada línea del pedido.
              </p>
            </div>
            <div className="header-actions">
              <button className="secondary-button" onClick={() => downloadAuditCsv("summary")}>CSV resumen</button>
              <button className="secondary-button" onClick={() => downloadAuditCsv("clients")}>CSV clientes</button>
              <button className="secondary-button" onClick={() => downloadAuditCsv("detail")}>CSV detalle</button>
              <button className="secondary-button" onClick={() => downloadAuditCsv("projected-orders")}>CSV pedidos proyectados</button>
              <button className="secondary-button" onClick={() => downloadAuditCsv("projected-detail")}>CSV líneas proyectadas</button>
              <button className="primary-button" onClick={loadAudit} disabled={auditLoading}>{auditLoading ? "Auditando..." : "Actualizar auditoría"}</button>
            </div>
          </div>

          <div className="credit-filters-panel objectives-filters audit-filter-grid">
            <label>
              Asesor
{renderAdvisorMultiSelect()}
            </label>
            <label>
              Rubro interno
              <select value={auditBucket} onChange={(event) => setAuditBucket(event.target.value)}>
                <option value="">Todos</option>
                {unitConfig.categories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
                <option value="otros">Fuera de este negocio</option>
              </select>
            </label>
            <label>
              Lista
              <select value={auditListType} onChange={(event) => setAuditListType(event.target.value)}>
                <option value="">Todas</option>
                <option value="distribuidor">Distribuidor</option>
                <option value="mostrador">Mostrador</option>
              </select>
            </label>
            <label>
              Límite detalle
              <select value={auditLimit} onChange={(event) => setAuditLimit(Number(event.target.value))}>
                <option value="250">250 líneas</option>
                <option value="500">500 líneas</option>
                <option value="1000">1000 líneas</option>
                <option value="2000">2000 líneas</option>
              </select>
            </label>
          </div>

          {auditError && <div className="error-banner">{auditError}</div>}

          <section className="credit-kpi-grid objectives-kpis">
            <div className="credit-kpi-card dark"><span>Venta neta auditada</span><strong>{money(auditData.totals.ventaNeta)}</strong></div>
            <div className="credit-kpi-card"><span>Venta bruta</span><strong>{money(auditData.totals.ventaBruta)}</strong></div>
            <div className="credit-kpi-card"><span>Desc. comercial</span><strong>{money(auditData.totals.descuentoComercial)}</strong></div>
            <div className="credit-kpi-card"><span>Desc. PP</span><strong>{money(auditData.totals.descuentoPp)}</strong></div>
            <div className="credit-kpi-card"><span>Facturas / líneas</span><strong>{auditData.totals.facturas || 0}</strong><small>{auditData.totals.lineas || 0} líneas</small></div>
            <div className="credit-kpi-card"><span>Clientes vendidos</span><strong>{auditData.totals.clientes || 0}</strong><small>Clientes únicos sin NC</small></div>
            <div className="credit-kpi-card"><span>A facturar sin IVA</span><strong>{money(auditData.totals.aFacturarSinImpuestos)}</strong><small>{auditData.projected.totals.pedidos || 0} pedidos proyectados</small></div>
            <div className="credit-kpi-card dark"><span>Venta + proyectado</span><strong>{money(auditData.totals.proyectadoTotal)}</strong><small>Venta neta + subtotal de pedidos</small></div>
          </section>

          <div className="credit-table-title compact-title projected-audit-title">
            <div>
              <h3>Pedidos incluidos en A facturar / Proyectado</h3>
              <p>
                El monto se toma de <strong>sale_order_line.price_subtotal</strong>: precio unitario por cantidad, considerando el descuento de línea y sin IVA ni otros impuestos.
              </p>
            </div>
          </div>
          <section className="credit-kpi-grid objectives-kpis projected-kpis">
            <div className="credit-kpi-card dark"><span>Monto proyectado sin IVA</span><strong>{money(auditData.projected.totals.montoProyectado)}</strong></div>
            <div className="credit-kpi-card"><span>Pedidos</span><strong>{auditData.projected.totals.pedidos || 0}</strong></div>
            <div className="credit-kpi-card"><span>Clientes</span><strong>{auditData.projected.totals.clientes || 0}</strong></div>
            <div className="credit-kpi-card"><span>Líneas / unidades</span><strong>{auditData.projected.totals.lineas || 0}</strong><small>{Number(auditData.projected.totals.unidades || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })} unidades</small></div>
          </section>

          <div className="credit-table-wrapper objectives-table-wrapper compact-scroll">
            <table className="credit-table objectives-table projected-orders-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pedido</th>
                  <th>Asesor</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Facturación</th>
                  <th>Lista</th>
                  <th>Rubros</th>
                  <th>Líneas</th>
                  <th>Unidades</th>
                  <th>Subtotal sin IVA</th>
                </tr>
              </thead>
              <tbody>
                {auditData.projected.orders.map((row, index) => (
                  <tr key={`audit-projected-order-${row.order_id || index}`}>
                    <td>{String(row.fecha_pedido || "").slice(0, 10)}</td>
                    <td><strong>{row.pedido}</strong><span>ID {row.order_id || "-"}</span></td>
                    <td>{row.advisor_name}</td>
                    <td><strong>{row.cliente_nombre}</strong><span>ID {row.cliente_id || "-"}</span></td>
                    <td>{row.estado_pedido}</td>
                    <td>{row.estado_facturacion_lh || row.estado_facturacion || "-"}</td>
                    <td><span>{row.list_type}</span><span>{row.lista_precios || "-"}</span></td>
                    <td>{row.buckets}</td>
                    <td>{row.lineas}</td>
                    <td>{Number(row.unidades || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
                    <td><strong>{money(row.monto_proyectado)}</strong></td>
                  </tr>
                ))}
                {!auditLoading && auditData.projected.orders.length === 0 && (
                  <tr><td colSpan="11">No hay pedidos incluidos en el proyectado para los filtros actuales.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="credit-table-title compact-title projected-lines-title">
            <div>
              <h3>Detalle de líneas proyectadas</h3>
              <p>Permite verificar producto, cantidad, precio, descuento y subtotal sin impuestos que forman cada pedido proyectado.</p>
            </div>
          </div>
          <div className="credit-table-wrapper objectives-table-wrapper compact-scroll">
            <table className="credit-table objectives-table projected-detail-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pedido</th>
                  <th>Asesor</th>
                  <th>Cliente</th>
                  <th>Producto</th>
                  <th>Rubro</th>
                  <th>Lista</th>
                  <th>Cant. pedida</th>
                  <th>Cant. facturada</th>
                  <th>Cant. a facturar</th>
                  <th>Precio unit.</th>
                  <th>Desc. línea</th>
                  <th>Subtotal sin IVA</th>
                </tr>
              </thead>
              <tbody>
                {auditData.projected.detail.map((row, index) => (
                  <tr key={`audit-projected-detail-${row.order_line_id || index}`}>
                    <td>{String(row.fecha_pedido || "").slice(0, 10)}</td>
                    <td><strong>{row.pedido}</strong></td>
                    <td>{row.advisor_name}</td>
                    <td>{row.cliente_nombre}</td>
                    <td><strong>{row.producto_nombre}</strong><span>SKU {row.sku || "-"}</span></td>
                    <td><span>{row.bucket}</span><span>{row.rubro_maestro} / {row.categoria_maestro}</span></td>
                    <td><span>{row.list_type}</span><span>{row.lista_precios || "-"}</span></td>
                    <td>{Number(row.cantidad_pedida || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
                    <td>{Number(row.cantidad_facturada || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
                    <td>{Number(row.cantidad_a_facturar || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
                    <td>{money(row.precio_unitario)}</td>
                    <td>{Number(row.descuento_linea || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%</td>
                    <td><strong>{money(row.subtotal_sin_impuestos)}</strong></td>
                  </tr>
                ))}
                {!auditLoading && auditData.projected.detail.length === 0 && (
                  <tr><td colSpan="13">Sin líneas proyectadas para mostrar.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="credit-table-title compact-title">
            <div>
              <h3>Resumen de venta real facturada</h3>
              <p>Venta neta ya contabilizada, separada por asesor, rubro y tipo de lista.</p>
            </div>
          </div>
          <div className="credit-table-wrapper objectives-table-wrapper">
            <table className="credit-table objectives-table">
              <thead>
                <tr>
                  <th>Asesor</th>
                  <th>Rubro</th>
                  <th>Lista</th>
                  <th>Venta bruta</th>
                  <th>Desc. comercial</th>
                  <th>Desc. PP</th>
                  <th>Venta neta</th>
                  <th>Clientes</th>
                  <th>Facturas</th>
                  <th>Líneas</th>
                </tr>
              </thead>
              <tbody>
                {auditData.summary.map((row, index) => (
                  <tr key={`audit-summary-${index}`}>
                    <td><strong>{row.advisor_name}</strong><span>ID {row.advisor_id || "-"}</span></td>
                    <td>{row.bucket}</td>
                    <td>{row.list_type}</td>
                    <td>{money(row.venta_bruta)}</td>
                    <td>{money(row.descuento_comercial)}</td>
                    <td>{money(row.descuento_pp)}</td>
                    <td><strong>{money(row.venta_neta)}</strong></td>
                    <td>{row.clientes}</td>
                    <td>{row.facturas}</td>
                    <td>{row.lineas}</td>
                  </tr>
                ))}
                {!auditLoading && auditData.summary.length === 0 && (
                  <tr><td colSpan="10">Sin datos de auditoría para los filtros actuales.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="credit-table-title compact-title">
            <div>
              <h3>Clientes vendidos detectados</h3>
              <p>Lista para investigar diferencias de clientes vendidos contra Power BI. Exportala y compará por asesor.</p>
            </div>
          </div>
          <div className="credit-table-wrapper objectives-table-wrapper compact-scroll">
            <table className="credit-table objectives-table">
              <thead>
                <tr>
                  <th>Asesor</th>
                  <th>Cliente</th>
                  <th>Rubro detectado</th>
                  <th>Facturas</th>
                  <th>Líneas</th>
                  <th>Venta neta</th>
                </tr>
              </thead>
              <tbody>
                {auditData.clients.slice(0, 300).map((row, index) => (
                  <tr key={`audit-client-${index}`}>
                    <td>{row.advisor_name}</td>
                    <td><strong>{row.cliente_nombre}</strong><span>ID {row.cliente_id}</span></td>
                    <td>{row.buckets}</td>
                    <td>{row.facturas}</td>
                    <td>{row.lineas}</td>
                    <td>{money(row.venta_neta)}</td>
                  </tr>
                ))}
                {!auditLoading && auditData.clients.length === 0 && (
                  <tr><td colSpan="6">Sin clientes para mostrar.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="credit-table-title compact-title">
            <div>
              <h3>Detalle de líneas</h3>
              <p>Primeras líneas calculadas con subtotal, descuentos y venta neta. Sirve para comparar factura/producto contra el extracto del Power BI.</p>
            </div>
          </div>
          <div className="credit-table-wrapper objectives-table-wrapper compact-scroll">
            <table className="credit-table objectives-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Factura</th>
                  <th>Asesor</th>
                  <th>Cliente</th>
                  <th>Producto</th>
                  <th>Rubro</th>
                  <th>Lista</th>
                  <th>Condición</th>
                  <th>Subtotal</th>
                  <th>Desc. Com.</th>
                  <th>Desc. PP</th>
                  <th>Venta neta</th>
                </tr>
              </thead>
              <tbody>
                {auditData.detail.map((row, index) => (
                  <tr key={`audit-detail-${index}`}>
                    <td>{String(row.fecha || "").slice(0, 10)}</td>
                    <td>{row.factura}</td>
                    <td>{row.advisor_name}</td>
                    <td>{row.cliente_nombre}</td>
                    <td><strong>{row.producto_nombre}</strong><span>SKU {row.sku || "-"}</span></td>
                    <td><span>{row.bucket}</span><span>{row.rubro_maestro} / {row.categoria_maestro}</span></td>
                    <td>{row.list_type}</td>
                    <td>{row.condicion_pago}</td>
                    <td>{money(row.venta_bruta)}</td>
                    <td>{money(row.descuento_comercial)}</td>
                    <td>{money(row.descuento_pp)}</td>
                    <td><strong>{money(row.venta_neta)}</strong></td>
                  </tr>
                ))}
                {!auditLoading && auditData.detail.length === 0 && (
                  <tr><td colSpan="12">Sin detalle para mostrar.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showObjectives && canManageObjectives && (
        <section className="score-config-card wide objectives-editor">
          <div className="score-config-card-header">
            <div>
              <h3>Carga de objetivos del mes</h3>
              <p>
                Cargá el objetivo por asesor y rubro. Estos importes alimentan el dashboard de vendedores y el resumen del supervisor.
              </p>
            </div>
            <div className="header-actions">
              <button className="secondary-button" onClick={copyPreviousMonth}>Copiar mes anterior</button>
              <button className="primary-button" onClick={saveObjectives} disabled={saving}>{saving ? "Guardando..." : "Guardar objetivos"}</button>
            </div>
          </div>

          <div className="objective-add-row">
            <select value={selectedAdvisorId} onChange={(event) => setSelectedAdvisorId(event.target.value)}>
              <option value="">Agregar asesor...</option>
              {advisors.map((advisor) => (
                <option key={`${advisor.id || advisor.name}`} value={advisor.id || advisor.name}>{advisor.name}</option>
              ))}
            </select>
            <button className="secondary-button" onClick={addAdvisorRow}>Agregar</button>
          </div>

          <div className="score-config-table-wrap">
            <table className="score-config-table">
              <thead>
                <tr>
                  <th>Asesor</th>
                  {unitConfig.categories.map((category) => <th key={category.key}>Objetivo {category.label}</th>)}
                  <th>Objetivo clientes vendidos</th>
                  <th>Total $</th>
                </tr>
              </thead>
              <tbody>
                {objectiveRows.map((row, index) => {
                  const total = unitConfig.categories.reduce((sum, category) => sum + Number(row[category.key] || 0), 0);
                  return (
                    <tr key={`${row.advisorId || row.advisor}-${index}`}>
                      <td><strong>{row.advisor}</strong></td>
                      {unitConfig.categories.map((category) => (
                        <td key={category.key}>
                          <input
                            type="number"
                            min="0"
                            value={row[category.key] || 0}
                            onChange={(event) => updateObjective(index, category.key, event.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={row.clientsObjective || 0}
                          onChange={(event) => updateClientsObjective(index, event.target.value)}
                        />
                      </td>
                      <td><strong>{money(total)}</strong></td>
                    </tr>
                  );
                })}
                {objectiveRows.length === 0 && (
                  <tr>
                    <td colSpan={unitConfig.categories.length + 3}>No hay asesores cargados para este período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="credit-table-card objectives-table-card">
        <div className="credit-table-title">
          <div>
            <h2>{unitConfig.label} · seguimiento por vendedor</h2>
            <p>Tabla resumen para comparar contra Power BI. Venta real sale de Odoo y objetivo desde la carga del supervisor.</p>
          </div>
          {loading && <span className="credit-loading">Cargando...</span>}
        </div>

        <div className="credit-table-wrapper objectives-table-wrapper">
          <table className="credit-table objectives-table">
            <thead>
              <tr>
                <th>Asesor</th>
                {unitConfig.categories.map((category) => (
                  <th key={category.key}>{category.label}</th>
                ))}
                <th>Objetivo asesor</th>
                <th>Venta neta total</th>
                <th>Otros negocios</th>
                <th>% cumpl.</th>
                <th>A facturar</th>
                <th>Proyectado</th>
                <th>% proy.</th>
                <th>Clientes vendidos</th>
                <th>Obj. clientes</th>
                <th>% clientes</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={`${row.advisorId || row.advisor}`}>
                  <td>
                    <button
                      type="button"
                      className="link-button advisor-audit-button"
                      onClick={() => openAdvisorAudit(row)}
                      title="Abrir auditoría del asesor para el período seleccionado"
                    >
                      {row.advisor}
                    </button>
                    <span>ID asesor: {row.advisorId || "-"}</span>
                  </td>
                  {unitConfig.categories.map((category) => {
                    const values = row.categories?.[category.key] || {};
                    return (
                      <td key={category.key}>
                        <strong>{money(values.sale)}</strong>
                        <span>Obj. {money(values.objective)} · {pct(values.fulfillment)}</span>
                        {unit === "ciclismo" && <span>Dist. {money(values.distributor)} · Most. {money(values.store)}</span>}
                      </td>
                    );
                  })}
                  <td><strong>{money(row.objectiveTotal)}</strong></td>
                  <td><strong>{money(row.salesTotal)}</strong></td>
                  <td><strong>{money(row.otherBusinessSales)}</strong><span>{row.otherBusinessClients || 0} clientes</span></td>
                  <td><span className={`credit-chip ${chipClass(row.status)}`}>{pct(row.fulfillmentTotal)}</span></td>
                  <td><strong>{money(row.pendingTotal)}</strong></td>
                  <td><strong>{money(row.projectedTotal)}</strong><span>Faltan {money(row.remaining)}</span></td>
                  <td><span className="credit-chip blue">{pct(row.projectedPct)}</span></td>
                  <td><strong>{row.clients || 0}</strong></td>
                  <td><strong>{row.clientsObjective || 0}</strong><span>Faltan {row.clientsRemaining || 0}</span></td>
                  <td><span className="credit-chip blue">{pct(row.clientsFulfillment)}</span></td>
                  <td><span className={`credit-chip ${chipClass(row.status)}`}>{row.status}</span></td>
                </tr>
              ))}
              {!loading && data.rows.length === 0 && (
                <tr>
                  <td colSpan={unitConfig.categories.length + 12}>
                    No hay datos para este período. Verificá filtros, ventas en Odoo u objetivos cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="credit-table-card objectives-table-card">
        <div className="credit-table-title">
          <div>
            <h2>Ranking rápido</h2>
            <p>Top 5 por venta neta del período seleccionado.</p>
          </div>
        </div>
        <div className="dashboard-ranking objectives-ranking">
          {ranking.map((row, index) => (
            <div className="dashboard-ranking-row" key={`ranking-${row.advisorId || row.advisor}`}>
              <div className="ranking-position">#{index + 1}</div>
              <div className="ranking-info"><strong>{row.advisor}</strong><span>{row.status}</span></div>
              <div className="ranking-metric"><span>Venta</span><strong>{money(row.salesTotal)}</strong></div>
              <div className="ranking-metric"><span>Cumpl.</span><strong>{pct(row.fulfillmentTotal)}</strong></div>
              <div className="ranking-metric"><span>Proy.</span><strong>{pct(row.projectedPct)}</strong></div>
            </div>
          ))}
          {ranking.length === 0 && <p className="empty-message">Sin ranking para mostrar.</p>}
        </div>
      </section>
    </div>
  );
}
