import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const UNIT_META = {
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
      { key: "mix", label: "Motopartes" },
      { key: "neumaticos", label: "Neumáticos" },
    ],
  },
};

const todayPeriod = new Date().toISOString().slice(0, 7);

function money(value) {
  return Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  });
}

function pct(value) {
  if (value === null || value === undefined) return "-";
  return `${Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

function emptyRules(unit) {
  const categories = UNIT_META[unit].categories;
  const sales = {};
  const reach = {};
  categories.forEach(({ key }) => {
    sales[key] = { mostrador: 0, distribuidor: 0 };
    reach[key] = [
      { minPct: 80, rate: 0 },
      { minPct: 90, rate: 0 },
      { minPct: 100, rate: 0 },
      { minPct: 120, rate: 0 },
    ];
  });
  return {
    sales,
    collections: [
      { method: "Efectivo", rate: 0.25 },
      { method: "Cheque", rate: 0.2 },
    ],
    reach,
    clients: [
      { minClients: 30, amount: 0 },
      { minClients: 40, amount: 0 },
      { minClients: 50, amount: 0 },
    ],
    multipliers: [],
    penaltyDefaultRate: 2,
    notes: "",
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function statusClass(status) {
  if (status === "Aprobada") return "commission-status approved";
  if (status === "Rechazada") return "commission-status rejected";
  if (status === "Devuelta") return "commission-status returned";
  if (status === "Enviada a RRHH") return "commission-status submitted";
  return "commission-status draft";
}

function CommissionLiquidations({ user }) {
  const [tab, setTab] = useState("liquidations");
  const [period, setPeriod] = useState(todayPeriod);
  const [unit, setUnit] = useState("ciclismo");
  const [status, setStatus] = useState("Todos");
  const [schemes, setSchemes] = useState([]);
  const [liquidations, setLiquidations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailClosing, setDetailClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [schemeEditor, setSchemeEditor] = useState(null);
  const [schemeClosing, setSchemeClosing] = useState(false);
  const [activationTarget, setActivationTarget] = useState(null);
  const [adjustment, setAdjustment] = useState({ adjustmentType: "adicional", concept: "", amount: "", notes: "" });

  const canManage = ["supervisor", "jefe", "admin"].includes(user.role);
  const canConfigure = ["supervisor", "jefe", "admin"].includes(user.role);
  const isHr = ["rrhh", "admin"].includes(user.role);

  const activeScheme = useMemo(
    () => schemes.find((item) =>
      item.unit === unit &&
      item.status === "Activo" &&
      (!item.valid_from || item.valid_from <= period) &&
      (!item.valid_to || item.valid_to >= period)
    ),
    [schemes, unit, period]
  );

  useEffect(() => {
    loadSchemes();
  }, [unit]);

  useEffect(() => {
    loadLiquidations();
  }, [period, unit, status]);

  useEffect(() => {
    if (!detail) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") closeDetail();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [detail]);

  useEffect(() => {
    if (!schemeEditor && !activationTarget) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      if (activationTarget) setActivationTarget(null);
      else closeSchemeEditor();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [schemeEditor, activationTarget]);

  async function api(path, options = {}) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`${API_URL}${path}${separator}userRole=${encodeURIComponent(user.role)}&user=${encodeURIComponent(user.name)}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) throw new Error(data?.error || data || "Error en la operación");
    return data;
  }

  async function loadSchemes() {
    try {
      const data = await api(`/api/commissions/schemes?unit=${unit}`);
      setSchemes(data || []);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadLiquidations() {
    try {
      const data = await api(`/api/commissions/liquidations?period=${period}&unit=${unit}&status=${encodeURIComponent(status)}`);
      setLiquidations(data || []);
      if (selectedId && !(data || []).some((item) => item.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadDetail(id) {
    setSelectedId(id);
    setDetailClosing(false);
    setLoading(true);
    try {
      const data = await api(`/api/commissions/liquidations/${id}`);
      setDetail(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function closeDetail() {
    if (!detail || detailClosing) return;

    setDetailClosing(true);
    window.setTimeout(() => {
      setDetail(null);
      setSelectedId(null);
      setDetailClosing(false);
    }, 220);
  }

  function closeSchemeEditor() {
    if (!schemeEditor || schemeClosing) return;
    setSchemeClosing(true);
    window.setTimeout(() => {
      setSchemeEditor(null);
      setSchemeClosing(false);
    }, 220);
  }

  async function calculate() {
    if (!activeScheme) {
      setMessage("Primero activá un esquema vigente para esta unidad.");
      setTab("schemes");
      return;
    }
    if (!window.confirm(`¿Calcular las comisiones de ${UNIT_META[unit].label} para ${period}?`)) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await api("/api/commissions/calculate", {
        method: "POST",
        body: JSON.stringify({ period, unit, schemeId: activeScheme.id, user: user.name, userRole: user.role }),
      });
      const omitted = (result.calculated || []).filter((item) => item.skipped).length;
      setMessage(`Cálculo terminado: ${(result.calculated || []).length - omitted} liquidaciones actualizadas${omitted ? ` y ${omitted} omitidas por estar cerradas o enviadas` : ""}.`);
      await loadLiquidations();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function newScheme() {
    setSchemeClosing(false);
    setSchemeEditor({
      id: null,
      name: `Esquema ${UNIT_META[unit].label}`,
      unit,
      version: 1,
      valid_from: period,
      valid_to: "",
      description: "",
      rules: emptyRules(unit),
      readOnly: false,
    });
  }

  function editScheme(scheme, readOnly = false) {
    setSchemeClosing(false);
    setSchemeEditor({ ...clone(scheme), rules: clone(scheme.rules || emptyRules(scheme.unit)), readOnly });
  }

  async function duplicateScheme(scheme) {
    setLoading(true);
    try {
      const created = await api("/api/commissions/schemes", {
        method: "POST",
        body: JSON.stringify({ sourceSchemeId: scheme.id, unit: scheme.unit, validFrom: period, user: user.name, userRole: user.role }),
      });
      await loadSchemes();
      editScheme(created);
      setMessage(`Nueva versión ${created.version} creada en borrador.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveScheme() {
    if (!schemeEditor?.name?.trim()) return setMessage("El esquema debe tener un nombre.");
    setLoading(true);
    try {
      const payload = {
        name: schemeEditor.name,
        unit: schemeEditor.unit,
        validFrom: schemeEditor.valid_from,
        validTo: schemeEditor.valid_to,
        description: schemeEditor.description,
        rules: schemeEditor.rules,
        user: user.name,
        userRole: user.role,
      };
      const saved = schemeEditor.id
        ? await api(`/api/commissions/schemes/${schemeEditor.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api("/api/commissions/schemes", { method: "POST", body: JSON.stringify(payload) });
      setSchemeEditor(null);
      await loadSchemes();
      setMessage(`Esquema ${saved.name} v${saved.version} guardado.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function activateScheme(scheme) {
    setActivationTarget(scheme);
  }

  async function confirmActivation() {
    const scheme = activationTarget;
    if (!scheme) return;
    setLoading(true);
    try {
      await api(`/api/commissions/schemes/${scheme.id}/activate`, {
        method: "POST",
        body: JSON.stringify({ user: user.name, userRole: user.role }),
      });
      setActivationTarget(null);
      await loadSchemes();
      setMessage(`Esquema ${scheme.name} v${scheme.version} activado. La versión anterior quedó como histórica.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function updateSales(category, channel, value) {
    setSchemeEditor((current) => ({
      ...current,
      rules: {
        ...current.rules,
        sales: {
          ...current.rules.sales,
          [category]: { ...current.rules.sales[category], [channel]: Number(value) },
        },
      },
    }));
  }

  function updateArrayRule(section, index, field, value) {
    setSchemeEditor((current) => {
      const rows = [...(current.rules[section] || [])];
      rows[index] = { ...rows[index], [field]: field === "method" || field === "name" || field === "metric" || field === "applyTo" ? value : Number(value) };
      return { ...current, rules: { ...current.rules, [section]: rows } };
    });
  }

  function updateReach(category, index, field, value) {
    setSchemeEditor((current) => {
      const rows = [...(current.rules.reach?.[category] || [])];
      rows[index] = { ...rows[index], [field]: Number(value) };
      return {
        ...current,
        rules: { ...current.rules, reach: { ...current.rules.reach, [category]: rows } },
      };
    });
  }

  function addRule(section, template) {
    setSchemeEditor((current) => ({
      ...current,
      rules: { ...current.rules, [section]: [...(current.rules[section] || []), template] },
    }));
  }

  function removeRule(section, index) {
    setSchemeEditor((current) => ({
      ...current,
      rules: { ...current.rules, [section]: (current.rules[section] || []).filter((_, idx) => idx !== index) },
    }));
  }

  function addReach(category) {
    setSchemeEditor((current) => ({
      ...current,
      rules: {
        ...current.rules,
        reach: { ...current.rules.reach, [category]: [...(current.rules.reach?.[category] || []), { minPct: 100, rate: 0 }] },
      },
    }));
  }

  function removeReach(category, index) {
    setSchemeEditor((current) => ({
      ...current,
      rules: {
        ...current.rules,
        reach: { ...current.rules.reach, [category]: (current.rules.reach?.[category] || []).filter((_, idx) => idx !== index) },
      },
    }));
  }

  async function addAdjustment() {
    if (!detail || !adjustment.concept.trim() || !Number(adjustment.amount)) return setMessage("Ingresá concepto e importe del ajuste.");
    setLoading(true);
    try {
      await api(`/api/commissions/liquidations/${detail.id}/adjustments`, {
        method: "POST",
        body: JSON.stringify({ ...adjustment, user: user.name, userRole: user.role }),
      });
      setAdjustment({ adjustmentType: "adicional", concept: "", amount: "", notes: "" });
      await loadDetail(detail.id);
      await loadLiquidations();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeAdjustment(id) {
    if (!window.confirm("¿Eliminar este ajuste?")) return;
    try {
      await api(`/api/commissions/liquidations/${detail.id}/adjustments/${id}`, { method: "DELETE" });
      await loadDetail(detail.id);
      await loadLiquidations();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function captureSnapshot() {
    setLoading(true);
    try {
      await api(`/api/commissions/liquidations/${detail.id}/snapshot`, { method: "POST", body: JSON.stringify({ user: user.name, userRole: user.role }) });
      await loadDetail(detail.id);
      setMessage("Detalle de facturas y cobranzas actualizado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function actionLiquidation(action) {
    let comments = "";
    if (["return", "reject"].includes(action)) {
      comments = window.prompt(action === "return" ? "Observación para devolver a Comercial:" : "Motivo del rechazo:") || "";
      if (!comments.trim()) return;
    } else if (action === "approve" && !window.confirm("¿Aprobar y bloquear esta liquidación?")) return;
    else if (action === "submit" && !window.confirm("¿Enviar esta liquidación a RRHH? Se congelará el detalle de facturas y cobranzas.")) return;

    setLoading(true);
    try {
      await api(`/api/commissions/liquidations/${detail.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action, comments, user: user.name, userRole: user.role }),
      });
      await loadDetail(detail.id);
      await loadLiquidations();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => liquidations.reduce((acc, item) => {
    acc.sales += Number(item.sales_total || 0);
    acc.commission += Number(item.final_total || 0);
    acc.pending += item.status === "Enviada a RRHH" ? 1 : 0;
    acc.approved += item.status === "Aprobada" ? 1 : 0;
    return acc;
  }, { sales: 0, commission: 0, pending: 0, approved: 0 }), [liquidations]);

  return (
    <div className="commissions-page">
      <header className="commissions-header">
        <div>
          <span className="eyebrow">SGI · GESTIÓN Y APROBACIÓN</span>
          <h1>Liquidación de comisiones</h1>
          <p>Motor configurable, preliquidación mensual y circuito de aprobación de RRHH.</p>
        </div>
        <div className="commission-tabs">
          <button className={tab === "liquidations" ? "active" : ""} onClick={() => setTab("liquidations")}>Liquidaciones</button>
          {canConfigure && <button className={tab === "schemes" ? "active" : ""} onClick={() => setTab("schemes")}>Esquemas</button>}
        </div>
      </header>

      {message && <div className="commission-message" onClick={() => setMessage("")}>{message}</div>}

      <section className="commission-filters">
        <label>Período<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
        <label>Unidad<select value={unit} onChange={(event) => { setUnit(event.target.value); setSchemeEditor(null); }}><option value="ciclismo">Ciclismo</option><option value="motociclismo">Motociclismo</option></select></label>
        {tab === "liquidations" && <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}>{["Todos", "Borrador", "Enviada a RRHH", "Devuelta", "Aprobada", "Rechazada"].map((item) => <option key={item}>{item}</option>)}</select></label>}
        <div className="commission-active-scheme">
          <span>Esquema activo</span>
          <strong>{activeScheme ? `${activeScheme.name} · v${activeScheme.version}` : "Sin esquema activo"}</strong>
        </div>
        {tab === "liquidations" && canManage && <button className="primary-button" disabled={loading} onClick={calculate}>{loading ? "Procesando..." : "Calcular período"}</button>}
        {tab === "liquidations" && <a className="secondary-button commission-export" href={`${API_URL}/api/commissions/export.csv?period=${period}&unit=${unit}&userRole=${user.role}&user=${encodeURIComponent(user.name)}`}>Exportar CSV</a>}
      </section>

      {tab === "liquidations" ? (
        <>
          <section className="commission-kpis">
            <article><span>Asesores</span><strong>{liquidations.length}</strong></article>
            <article><span>Facturación considerada</span><strong>{money(totals.sales)}</strong></article>
            <article><span>Total comisiones</span><strong>{money(totals.commission)}</strong></article>
            <article><span>Pendientes RRHH</span><strong>{totals.pending}</strong></article>
            <article><span>Aprobadas</span><strong>{totals.approved}</strong></article>
          </section>

          <section className="commission-layout">
            <div className="commission-list-card">
              <div className="commission-table-wrap">
                <table className="commission-table">
                  <thead><tr><th>Asesor</th><th>Objetivo</th><th>Facturado</th><th>Alcance</th><th>Clientes</th><th>Base</th><th>Ajustes</th><th>Total</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {liquidations.map((item) => (
                      <tr key={item.id} className={selectedId === item.id ? "selected" : ""}>
                        <td><strong>{item.advisor_name}</strong><small>{item.scheme_name} · v{item.scheme_version}</small></td>
                        <td>{money(item.objective_total)}</td><td>{money(item.sales_total)}</td><td>{pct(item.fulfillment_total)}</td><td>{item.clients_sold}</td>
                        <td>{money(item.base_commission)}</td><td>{money(item.adjustments_total)}</td><td><strong>{money(item.final_total)}</strong></td>
                        <td><span className={statusClass(item.status)}>{item.status}</span></td><td><button className="view-btn" onClick={() => loadDetail(item.id)}>Ver</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!liquidations.length && <div className="commission-empty">Todavía no hay liquidaciones calculadas para este período.</div>}
              </div>
            </div>

            {detail && (
              <div
                className={`commission-modal-backdrop ${detailClosing ? "closing" : ""}`}
                onMouseDown={closeDetail}
                role="presentation"
              >
                <aside
                  className="commission-detail commission-detail-modal"
                  onMouseDown={(event) => event.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Liquidación de ${detail.advisor_name}`}
                >
                <div className="commission-detail-head">
                  <div><span>{detail.period} · {UNIT_META[detail.unit]?.label}</span><h2>{detail.advisor_name}</h2><p>{detail.scheme_name} · versión {detail.scheme_version}</p></div>
                  <button onClick={closeDetail} aria-label="Cerrar detalle">×</button>
                </div>
                <div className="commission-detail-status"><span className={statusClass(detail.status)}>{detail.status}</span>{detail.review_observation && <p>{detail.review_observation}</p>}</div>

                <div className="commission-detail-kpis">
                  <article><span>Objetivo</span><strong>{money(detail.objective_total)}</strong></article>
                  <article><span>Facturado</span><strong>{money(detail.sales_total)}</strong></article>
                  <article><span>Alcance</span><strong>{pct(detail.fulfillment_total)}</strong></article>
                  <article><span>Clientes</span><strong>{detail.clients_sold}</strong></article>
                  <article><span>Cobranzas</span><strong>{money(detail.collections_total)}</strong></article>
                  <article className="highlight"><span>Total final</span><strong>{money(detail.final_total)}</strong></article>
                </div>

                <section className="commission-detail-section">
                  <h3>Composición del cálculo</h3>
                  <div className="commission-items">
                    {(detail.items || []).map((item) => <div key={item.id} className="commission-item"><div><strong>{item.concept}</strong><span>{item.item_type}{item.rate ? ` · ${pct(item.rate)}` : ""}</span></div><div><small>Base {money(item.base_amount)}</small><strong>{money(item.amount)}</strong></div></div>)}
                  </div>
                </section>

                <section className="commission-detail-section">
                  <div className="section-title-row"><h3>Ajustes auditados</h3><strong>{money(detail.adjustments_total)}</strong></div>
                  {(detail.adjustments || []).map((item) => <div key={item.id} className="commission-adjustment-row"><div><strong>{item.adjustment_type}: {item.concept}</strong><span>{item.notes || "Sin observación"} · {item.created_by}</span></div><strong className={item.amount < 0 ? "negative" : "positive"}>{money(item.amount)}</strong>{canManage && ["Borrador", "Devuelta"].includes(detail.status) && <button onClick={() => removeAdjustment(item.id)}>Eliminar</button>}</div>)}
                  {canManage && ["Borrador", "Devuelta"].includes(detail.status) && <div className="commission-adjustment-form"><select value={adjustment.adjustmentType} onChange={(event) => setAdjustment({ ...adjustment, adjustmentType: event.target.value })}><option value="adicional">Adicional</option><option value="penalizacion">Penalización</option></select><input placeholder="Concepto" value={adjustment.concept} onChange={(event) => setAdjustment({ ...adjustment, concept: event.target.value })} /><input type="number" placeholder="Importe" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })} /><input placeholder="Observación" value={adjustment.notes} onChange={(event) => setAdjustment({ ...adjustment, notes: event.target.value })} /><button onClick={addAdjustment}>Agregar</button></div>}
                </section>

                <section className="commission-detail-section">
                  <div className="section-title-row"><h3>Facturas y cobranzas</h3>{canManage && ["Borrador", "Devuelta"].includes(detail.status) && <button className="view-btn" disabled={loading} onClick={captureSnapshot}>{detail.sourceSnapshot ? "Actualizar detalle" : "Cargar detalle"}</button>}</div>
                  {detail.sourceSnapshot ? <>
                    <p className="commission-source-note">Fotografía tomada el {new Date(detail.sourceSnapshot.capturedAt).toLocaleString("es-AR")}. Se congela al enviar a RRHH.</p>
                    <div className="commission-source-summary"><span>{detail.sourceSnapshot.audit?.detail?.length || 0} líneas de facturas</span><span>{detail.sourceSnapshot.audit?.clients?.length || 0} clientes</span><span>{detail.sourceSnapshot.collections?.rows?.length || 0} cobranzas validadas</span></div>
                    {(detail.sourceSnapshot.audit?.detail?.length || 0) > 500 && <p className="commission-source-note">La vista muestra las primeras 500 líneas para mantener el rendimiento. La fotografía completa queda guardada en la liquidación.</p>}
                    <details><summary>Ver facturas incluidas</summary><div className="source-table-wrap"><table><thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Producto</th><th>Canal</th><th>Venta neta</th></tr></thead><tbody>{(detail.sourceSnapshot.audit?.detail || []).slice(0, 500).map((row, index) => <tr key={`${row.move_id}-${row.product_id}-${index}`}><td>{String(row.fecha || "").slice(0, 10)}</td><td>{row.factura}</td><td>{row.cliente_nombre}</td><td>{row.sku} · {row.producto_nombre}</td><td>{row.list_type}</td><td>{money(row.venta_neta)}</td></tr>)}</tbody></table></div></details>
                    <details><summary>Ver cobranzas incluidas</summary><div className="source-table-wrap"><table><thead><tr><th>Fecha</th><th>Recibo</th><th>Cliente</th><th>Medio</th><th>Facturas</th><th>Total</th></tr></thead><tbody>{(detail.sourceSnapshot.collections?.rows || []).map((row) => <tr key={row.id}><td>{String(row.validated_at || row.created_at || "").slice(0, 10)}</td><td>{row.receipt_number}</td><td>{row.cliente}</td><td>{row.payment_method}</td><td>{row.invoices || "-"}</td><td>{money(row.total)}</td></tr>)}</tbody></table></div></details>
                  </> : <p className="commission-source-note">Cargá el detalle para auditar las facturas y cobranzas que originan la liquidación.</p>}
                </section>

                <section className="commission-detail-section">
                  <h3>Historial</h3>
                  <div className="commission-history">{(detail.history || []).map((item) => <div key={item.id}><span>{new Date(`${item.created_at}Z`).toLocaleString("es-AR")}</span><strong>{item.action}</strong><p>{item.from_status ? `${item.from_status} → ${item.to_status}` : item.to_status} · {item.user_name} ({item.user_role}){item.comments ? ` · ${item.comments}` : ""}</p></div>)}</div>
                </section>

                <div className="commission-actions">
                  <a className="secondary-button commission-export" href={`${API_URL}/api/commissions/liquidations/${detail.id}/export.csv?userRole=${user.role}&user=${encodeURIComponent(user.name)}`}>Exportar detalle</a>
                  {canManage && ["Borrador", "Devuelta"].includes(detail.status) && <button className="primary-button" onClick={() => actionLiquidation("submit")}>Enviar a RRHH</button>}
                  {isHr && detail.status === "Enviada a RRHH" && <><button className="primary-button" onClick={() => actionLiquidation("approve")}>Aprobar</button><button className="secondary-button" onClick={() => actionLiquidation("return")}>Devolver</button><button className="danger-button" onClick={() => actionLiquidation("reject")}>Rechazar</button></>}
                </div>
                </aside>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="scheme-layout">
          <div className="scheme-list">
            <div className="section-title-row">
              <div>
                <h2>Esquemas comisionales</h2>
                <p>Una sola versión puede estar activa por unidad. Las versiones vigentes quedan bloqueadas para proteger el historial.</p>
              </div>
              <button className="primary-button" onClick={newScheme}>Nuevo esquema</button>
            </div>
            <div className="scheme-version-help">
              <strong>Borrador</strong> se puede editar y activar. <strong>Activo</strong> es de solo lectura; para cambiarlo se crea una nueva versión.
            </div>
            {schemes.map((scheme) => (
              <article key={scheme.id} className={`scheme-card ${scheme.status === "Activo" ? "active" : ""}`}>
                <div>
                  <span>{UNIT_META[scheme.unit]?.label} · versión {scheme.version}</span>
                  <h3>{scheme.name}</h3>
                  <p>{scheme.description || "Sin descripción"}</p>
                  <small>Vigencia: {scheme.valid_from || "-"} a {scheme.valid_to || "sin fin"}</small>
                </div>
                <div className="scheme-card-actions">
                  <span className={scheme.status === "Activo" ? "commission-status approved" : "commission-status draft"}>{scheme.status}</span>
                  {scheme.status === "Borrador" ? (
                    <>
                      <button className="scheme-edit-button" onClick={() => editScheme(scheme)}>Editar</button>
                      <button className="scheme-activate-button" onClick={() => activateScheme(scheme)}>✓ Activar versión</button>
                    </>
                  ) : (
                    <button className="scheme-view-button" onClick={() => editScheme(scheme, true)}>Ver configuración</button>
                  )}
                  <button onClick={() => duplicateScheme(scheme)}>Nueva versión</button>
                </div>
              </article>
            ))}
          </div>

          {schemeEditor && (
            <div className={`scheme-modal-backdrop ${schemeClosing ? "closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeSchemeEditor(); }}>
              <aside className="scheme-editor scheme-editor-modal" onMouseDown={(event) => event.stopPropagation()}>
                <div className="commission-detail-head">
                  <div>
                    <span>{schemeEditor.readOnly ? "CONSULTA DE VERSIÓN" : "CONFIGURACIÓN"}</span>
                    <h2>{schemeEditor.readOnly ? `Ver v${schemeEditor.version}` : schemeEditor.id ? `Editar v${schemeEditor.version}` : "Nuevo esquema"}</h2>
                    {schemeEditor.readOnly && <p>Esta versión está activa y no puede modificarse. Creá una nueva versión para realizar cambios.</p>}
                  </div>
                  <button onClick={closeSchemeEditor}>×</button>
                </div>

                <fieldset className="scheme-editor-fieldset" disabled={schemeEditor.readOnly}>
                  <div className="scheme-form-grid"><label>Nombre<input value={schemeEditor.name} onChange={(event) => setSchemeEditor({ ...schemeEditor, name: event.target.value })} /></label><label>Vigencia desde<input type="month" value={schemeEditor.valid_from || ""} onChange={(event) => setSchemeEditor({ ...schemeEditor, valid_from: event.target.value })} /></label><label>Vigencia hasta<input type="month" value={schemeEditor.valid_to || ""} onChange={(event) => setSchemeEditor({ ...schemeEditor, valid_to: event.target.value })} /></label><label className="full">Descripción<textarea value={schemeEditor.description || ""} onChange={(event) => setSchemeEditor({ ...schemeEditor, description: event.target.value })} /></label></div>

                  <h3>Comisión por venta</h3>
                  <table className="rule-table"><thead><tr><th>Rubro</th><th>Mostrador %</th><th>Distribuidor %</th></tr></thead><tbody>{UNIT_META[schemeEditor.unit].categories.map((category) => <tr key={category.key}><td>{category.label}</td><td><input type="number" step="0.01" value={schemeEditor.rules.sales?.[category.key]?.mostrador ?? 0} onChange={(event) => updateSales(category.key, "mostrador", event.target.value)} /></td><td><input type="number" step="0.01" value={schemeEditor.rules.sales?.[category.key]?.distribuidor ?? 0} onChange={(event) => updateSales(category.key, "distribuidor", event.target.value)} /></td></tr>)}</tbody></table>

                  <h3>Escalas por alcance</h3>
                  {UNIT_META[schemeEditor.unit].categories.map((category) => <div key={category.key} className="rule-block"><div className="section-title-row"><strong>{category.label}</strong><button type="button" onClick={() => addReach(category.key)}>+ Escalón</button></div>{(schemeEditor.rules.reach?.[category.key] || []).map((row, index) => <div key={index} className="inline-rule"><label>Desde %<input type="number" value={row.minPct} onChange={(event) => updateReach(category.key, index, "minPct", event.target.value)} /></label><label>Comisión %<input type="number" step="0.01" value={row.rate} onChange={(event) => updateReach(category.key, index, "rate", event.target.value)} /></label><button type="button" onClick={() => removeReach(category.key, index)}>×</button></div>)}</div>)}

                  <div className="rule-two-columns">
                    <div className="rule-block"><div className="section-title-row"><h3>Cobranzas</h3><button type="button" onClick={() => addRule("collections", { method: "Otro", rate: 0 })}>+ Medio</button></div>{(schemeEditor.rules.collections || []).map((row, index) => <div key={index} className="inline-rule"><input value={row.method} onChange={(event) => updateArrayRule("collections", index, "method", event.target.value)} /><input type="number" step="0.01" value={row.rate} onChange={(event) => updateArrayRule("collections", index, "rate", event.target.value)} /><button type="button" onClick={() => removeRule("collections", index)}>×</button></div>)}</div>
                    <div className="rule-block"><div className="section-title-row"><h3>Premio por clientes</h3><button type="button" onClick={() => addRule("clients", { minClients: 0, amount: 0 })}>+ Escalón</button></div>{(schemeEditor.rules.clients || []).map((row, index) => <div key={index} className="inline-rule"><label>Clientes<input type="number" value={row.minClients} onChange={(event) => updateArrayRule("clients", index, "minClients", event.target.value)} /></label><label>Premio<input type="number" value={row.amount} onChange={(event) => updateArrayRule("clients", index, "amount", event.target.value)} /></label><button type="button" onClick={() => removeRule("clients", index)}>×</button></div>)}</div>
                  </div>

                  <div className="rule-block"><div className="section-title-row"><h3>Multiplicadores</h3><button type="button" onClick={() => addRule("multipliers", { name: "Potenciador", metric: "objective", minPct: 100, rate: 10, applyTo: "subtotal" })}>+ Multiplicador</button></div>{(schemeEditor.rules.multipliers || []).map((row, index) => <div key={index} className="multiplier-rule"><input value={row.name} onChange={(event) => updateArrayRule("multipliers", index, "name", event.target.value)} /><select value={row.metric} onChange={(event) => updateArrayRule("multipliers", index, "metric", event.target.value)}><option value="objective">Alcance objetivo</option><option value="clients">Alcance clientes</option></select><input type="number" value={row.minPct} onChange={(event) => updateArrayRule("multipliers", index, "minPct", event.target.value)} /><input type="number" step="0.01" value={row.rate} onChange={(event) => updateArrayRule("multipliers", index, "rate", event.target.value)} /><select value={row.applyTo} onChange={(event) => updateArrayRule("multipliers", index, "applyTo", event.target.value)}><option value="subtotal">Subtotal comisión</option><option value="sales">Comisión ventas</option><option value="reach">Comisión alcance</option><option value="collections">Comisión cobranzas</option></select><button type="button" onClick={() => removeRule("multipliers", index)}>×</button></div>)}</div>

                  <div className="scheme-form-grid"><label>Penalización de referencia %<input type="number" step="0.01" value={schemeEditor.rules.penaltyDefaultRate ?? 0} onChange={(event) => setSchemeEditor({ ...schemeEditor, rules: { ...schemeEditor.rules, penaltyDefaultRate: Number(event.target.value) } })} /></label><label className="full">Notas del esquema<textarea value={schemeEditor.rules.notes || ""} onChange={(event) => setSchemeEditor({ ...schemeEditor, rules: { ...schemeEditor.rules, notes: event.target.value } })} /></label></div>
                </fieldset>

                <div className="commission-actions scheme-modal-actions">
                  {!schemeEditor.readOnly && <button className="primary-button" disabled={loading} onClick={saveScheme}>Guardar borrador</button>}
                  <button className="secondary-button" onClick={closeSchemeEditor}>{schemeEditor.readOnly ? "Cerrar" : "Cancelar"}</button>
                </div>
              </aside>
            </div>
          )}

          {activationTarget && (
            <div className="scheme-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActivationTarget(null); }}>
              <section className="scheme-confirm-modal" onMouseDown={(event) => event.stopPropagation()}>
                <span className="scheme-confirm-icon">✓</span>
                <h2>Activar versión {activationTarget.version}</h2>
                <p><strong>{activationTarget.name}</strong> pasará a ser el esquema vigente de {UNIT_META[activationTarget.unit]?.label}.</p>
                <ul>
                  <li>La versión activa anterior quedará como histórica.</li>
                  <li>Las nuevas liquidaciones utilizarán esta versión.</li>
                  <li>Las liquidaciones ya calculadas no se modificarán.</li>
                  <li>Una vez activa, esta versión será de solo lectura.</li>
                </ul>
                <div className="commission-actions">
                  <button className="secondary-button" onClick={() => setActivationTarget(null)}>Cancelar</button>
                  <button className="scheme-activate-button" disabled={loading} onClick={confirmActivation}>{loading ? "Activando..." : "Confirmar activación"}</button>
                </div>
              </section>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default CommissionLiquidations;
