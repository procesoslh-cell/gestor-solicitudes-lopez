import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function money(value) {
  const number = Number(value || 0);

  return number.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";

  return `${(Number(value) * 100).toFixed(0)}%`;
}

function shortDate(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("es-AR");
  } catch {
    return "-";
  }
}

function scoreClass(color) {
  if (color === "green") return "credit-chip green";
  if (color === "blue") return "credit-chip blue";
  if (color === "yellow") return "credit-chip yellow";
  if (color === "orange") return "credit-chip orange";
  if (color === "red") return "credit-chip red";
  return "credit-chip";
}

function bcraChipClass(bcra) {
  if (!bcra) return "credit-chip";
  if (bcra.status === "invalid_cuit" || bcra.status === "error") return "credit-chip red";
  if (bcra.status === "no_data") return "credit-chip blue";
  if (Number(bcra.cheques_impagos || 0) > 0) return "credit-chip red";
  if (Number(bcra.situacion_maxima || 0) >= 4) return "credit-chip red";
  if (Number(bcra.situacion_maxima || 0) > 1 || Number(bcra.cheques_recientes || 0) > 0) return "credit-chip yellow";
  return "credit-chip green";
}

function bcraLabel(bcra) {
  if (!bcra) return "Sin consulta";
  if (bcra.status === "invalid_cuit") return "CUIT inválido";
  if (bcra.status === "error") return "Error BCRA";
  if (bcra.status === "no_data") return "Sin datos";
  if (bcra.status !== "ok") return bcra.status || "BCRA";
  return `Sit. ${bcra.situacion_maxima || 0}`;
}

function CreditAccountDetail({ clienteId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [bcraLoading, setBcraLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("resumen");

  async function loadDetail() {
    if (!clienteId) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/credit/accounts/${clienteId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo cargar la cuenta del cliente");
      }

      setDetail(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  async function consultBcra() {
    if (!clienteId) return;

    setBcraLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/credit/accounts/${clienteId}/bcra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo consultar BCRA");
      }

      await loadDetail();
      setTab("bcra");
    } catch (err) {
      setError(err.message);
    } finally {
      setBcraLoading(false);
    }
  }

  const account = detail?.account;
  const evaluation = detail?.evaluation;
  const bcra = account?.bcra;

  return (
    <div className="modal-overlay">
      <div className="modal credit-detail-modal">
        <div className="modal-header">
          <div>
            <span className="section-eyebrow">Ficha cuenta cliente</span>
            <h2>{account?.cliente || "Cuenta cliente"}</h2>
            {account && (
              <p>
                CUIT {account.cuit || "sin CUIT"} · Asesor {account.asesor || "sin asesor"}
              </p>
            )}
          </div>

          <button onClick={onClose}>×</button>
        </div>

        {loading && <div className="empty-state">Cargando ficha crediticia...</div>}
        {error && <div className="error-banner">{error}</div>}

        {!loading && !error && account && (
          <>
            <div className="credit-detail-hero">
              <div>
                <span>Score final</span>
                <strong>{account.score}</strong>
                <em>/ 1000</em>
              </div>
              <div>
                <span>Score interno</span>
                <strong>{account.score_interno ?? account.score}</strong>
                <em>/ 1000</em>
              </div>
              <div>
                <span>BCRA</span>
                <strong className={bcraChipClass(bcra)}>{bcraLabel(bcra)}</strong>
              </div>
              <div>
                <span>Disponible según Odoo</span>
                <strong className={account.limite_disponible < 0 ? "negative-money" : "positive-money"}>
                  {money(account.limite_disponible)}
                </strong>
              </div>
              <div>
                <span title="Límite calculado por score menos exposición crediticia">Disponible según score</span>
                <strong className={(account.monto_disponible_score || 0) <= 0 ? "negative-money" : "positive-money"}>
                  {money(account.monto_disponible_score || 0)}
                </strong>
              </div>
              <div>
                <span>% límite ocupado</span>
                <strong>{pct(account.porcentaje_ocupado)}</strong>
              </div>
            </div>

            <div className="credit-tabs">
              {[
                ["resumen", "Resumen"],
                ["deuda", "Cuenta corriente"],
                ["pedidos", "Pedidos"],
                ["bcra", "BCRA"],
                ["score", "Score"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={tab === value ? "active" : ""}
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "resumen" && (
              <div className="credit-detail-grid">
                <div className="detail-box">
                  <h3>Exposición crediticia</h3>
                  <p><b>Límite concedido:</b> {money(account.limite_concedido)}</p>
                  <p><b>Cta Cte:</b> {money(account.saldo)}</p>
                  <p><b>Cheques:</b> {money(account.cheques)}</p>
                  <p><b>Presupuesto mes:</b> {money(account.pedidos_venta)}</p>
                  <p><b>Exposición crediticia:</b> {money(account.exposicion_total)}</p>
                  <p><b>Promedio últimas facturas:</b> {money(account.promedio_ultimas_facturas || 0)} ({account.cantidad_facturas_promedio || 0})</p>
                  <p><b>Límite calculado:</b> {money(account.limite_calculado || 0)}</p>
                  <p><b>Disponible según score:</b> {money(account.monto_disponible_score || 0)}</p>
                  <p><b>Motivo:</b> {account.motivo || "-"}</p>
                </div>

                <div className="detail-box">
                  <h3>Deuda y mora</h3>
                  <p><b>Deuda vencida:</b> {money(account.deuda_vencida)}</p>
                  <p><b>No vencido:</b> {money(account.deuda_no_vencida)}</p>
                  <p><b>Mora máxima:</b> {account.mora_maxima} días</p>
                  <p><b>Facturas pendientes:</b> {account.facturas_pendientes}</p>
                  <p><b>Condición de pago:</b> {account.condicion_pago || "No disponible"}</p>
                </div>

                <div className="detail-box">
                  <h3>BCRA</h3>
                  <p><b>Estado:</b> <span className={bcraChipClass(bcra)}>{bcraLabel(bcra)}</span></p>
                  <p><b>Deuda BCRA:</b> {money(bcra?.deuda_total_bcra || 0)}</p>
                  <p><b>Cheques rechazados recientes:</b> {bcra?.cheques_recientes ?? "-"}</p>
                  <p><b>Última consulta:</b> {shortDate(bcra?.consulted_at)}</p>
                  <button className="secondary-button" onClick={consultBcra} disabled={bcraLoading}>
                    {bcraLoading ? "Consultando..." : "Consultar / actualizar BCRA"}
                  </button>
                </div>

                <div className="detail-box">
                  <h3>Recomendación</h3>
                  <p><b>Acción sugerida:</b> {account.accion_sugerida || "-"}</p>
                  <p><b>Prioridad:</b> {account.prioridad_comercial || "-"}</p>
                  <p><b>Motivo:</b> {account.motivo_accion || "-"}</p>
                  <p>{account.recomendacion}</p>
                  {account.alertas?.length > 0 && (
                    <div className="credit-alerts">
                      {account.alertas.map((alerta) => (
                        <span key={alerta}>{alerta}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "deuda" && (
              <div className="credit-table-wrapper compact">
                <table className="credit-table">
                  <thead>
                    <tr>
                      <th>Factura</th>
                      <th>Fecha</th>
                      <th>Vencimiento</th>
                      <th>Importe</th>
                      <th>Saldo</th>
                      <th>Días vencidos</th>
                      <th>Estado pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.facturas || []).map((item) => (
                      <tr key={item.factura_id}>
                        <td>{item.factura}</td>
                        <td>{shortDate(item.fecha_factura)}</td>
                        <td>{shortDate(item.fecha_vencimiento)}</td>
                        <td>{money(item.importe_original)}</td>
                        <td>{money(item.saldo_pendiente)}</td>
                        <td>
                          <span className={Number(item.dias_vencidos || 0) > 30 ? "credit-chip red" : "credit-chip"}>
                            {item.dias_vencidos || 0} días
                          </span>
                        </td>
                        <td>{item.payment_state || "-"}</td>
                      </tr>
                    ))}
                    {(detail.facturas || []).length === 0 && (
                      <tr>
                        <td colSpan="7">No hay facturas pendientes para mostrar.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "pedidos" && (
              <div className="credit-table-wrapper compact">
                <table className="credit-table">
                  <thead>
                    <tr>
                      <th>Pedido / presupuesto</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.pedidos || []).map((item) => (
                      <tr key={item.pedido_id}>
                        <td>{item.pedido}</td>
                        <td>{shortDate(item.fecha)}</td>
                        <td>{item.state}</td>
                        <td>{money(item.monto)}</td>
                      </tr>
                    ))}
                    {(detail.pedidos || []).length === 0 && (
                      <tr>
                        <td colSpan="4">No hay pedidos o presupuestos abiertos.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "bcra" && (
              <div className="credit-score-explain">
                <div className="detail-box wide">
                  <div className="credit-bcra-header">
                    <div>
                      <h3>Central de Deudores BCRA</h3>
                      <p>
                        Consulta por CUIT/CUIL/CDI. Se guarda una copia local con fecha de consulta para no consultar BCRA en cada refresh.
                      </p>
                    </div>
                    <button className="primary-button" onClick={consultBcra} disabled={bcraLoading}>
                      {bcraLoading ? "Consultando..." : "Consultar / actualizar BCRA"}
                    </button>
                  </div>
                </div>

                {!bcra && (
                  <div className="empty-state">
                    Todavía no hay consulta BCRA para este cliente. Tocá “Consultar / actualizar BCRA”.
                  </div>
                )}

                {bcra && (
                  <div className="credit-bcra-summary">
                    <div>
                      <span>Estado</span>
                      <strong className={bcraChipClass(bcra)}>{bcraLabel(bcra)}</strong>
                    </div>
                    <div>
                      <span>Denominación BCRA</span>
                      <strong>{bcra.denominacion || "-"}</strong>
                    </div>
                    <div>
                      <span>Período</span>
                      <strong>{bcra.periodo || "-"}</strong>
                    </div>
                    <div>
                      <span>Deuda BCRA</span>
                      <strong>{money(bcra.deuda_total_bcra || 0)}</strong>
                    </div>
                    <div>
                      <span>Entidades</span>
                      <strong>{bcra.entidades_count ?? "-"}</strong>
                    </div>
                    <div>
                      <span>Días atraso máx.</span>
                      <strong>{bcra.dias_atraso_max ?? "-"}</strong>
                    </div>
                    <div>
                      <span>Peor situación 24m</span>
                      <strong>{bcra.historico_peor_situacion ?? "-"}</strong>
                    </div>
                    <div>
                      <span>Cheques rechazados</span>
                      <strong>{bcra.cheques_total ?? 0}</strong>
                    </div>
                    <div>
                      <span>Cheques recientes</span>
                      <strong>{bcra.cheques_recientes ?? 0}</strong>
                    </div>
                    <div>
                      <span>Cheques pendientes</span>
                      <strong>{bcra.cheques_impagos ?? 0}</strong>
                    </div>
                    <div>
                      <span>Monto cheques</span>
                      <strong>{money(bcra.monto_cheques_rechazados || 0)}</strong>
                    </div>
                    <div>
                      <span>Última consulta</span>
                      <strong>{shortDate(bcra.consulted_at)}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "score" && (
              <div className="credit-score-explain">
                <div className="detail-box wide">
                  <h3>Cómo se calculó</h3>
                  <p>
                    El score arranca en 1000 puntos y descuenta por mora, deuda vencida contra promedio mensual, ocupación de límite, cliente nuevo, datos incompletos y alertas BCRA si existen.
                  </p>
                  <p><b>Score interno:</b> {evaluation?.scoreInterno ?? account.score_interno ?? account.score} · <b>Impacto BCRA:</b> {account.bcra_impacto || 0} · <b>Score final:</b> {account.score}</p>
                </div>

                <div className="credit-rules-list">
                  {(evaluation?.appliedRules || []).map((rule) => (
                    <div key={rule.key} className="credit-rule-row">
                      <div>
                        <strong>{rule.label}</strong>
                        {(rule.review || rule.block) && (
                          <p>{rule.block ? "Regla bloqueante" : "Requiere revisión"}</p>
                        )}
                      </div>
                      <span>{rule.points}</span>
                    </div>
                  ))}
                  {(evaluation?.appliedRules || []).length === 0 && (
                    <div className="empty-state">Sin descuentos aplicados por política actual.</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CreditAccounts({ user, mode = "accounts" }) {
  const isSellMode = mode === "sell";
  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(isSellMode ? "Para vender" : "Cartera comercial");
  const [selectedClient, setSelectedClient] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(300);
  const [pagination, setPagination] = useState(null);
  const [conceptos, setConceptos] = useState(null);

  async function loadAccounts(options = {}) {
    const nextPage = Number(options.page || page || 1);
    const nextLimit = Number(options.limit || pageSize || 300);
    const append = Boolean(options.append);

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        search,
        status,
        role: user.role,
        odooUserId: user.odoo_user_id || "",
        page: String(nextPage),
        limit: String(nextLimit),
      });

      const response = await fetch(`${API_URL}/api/credit/accounts?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo cargar Cuenta Cliente");
      }

      setRows((previous) => (append ? [...previous, ...(data.data || [])] : data.data || []));
      setKpis(data.kpis || null);
      setPagination(data.pagination || null);
      setConceptos(data.conceptos || null);
      setPage(nextPage);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function resetAndLoad(overrides = {}) {
    const nextLimit = Number(overrides.limit || pageSize || 300);
    setPage(1);
    loadAccounts({ page: 1, limit: nextLimit, append: false });
  }

  function handleStatusChange(value) {
    setStatus(value);
    setPage(1);
  }

  function handlePageSizeChange(value) {
    const nextLimit = Number(value || 300);
    setPageSize(nextLimit);
    setPage(1);
    setTimeout(() => loadAccounts({ page: 1, limit: nextLimit, append: false }), 0);
  }

  useEffect(() => {
    loadAccounts({ page: 1, limit: pageSize, append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mode]);

  const summary = useMemo(() => {
    if (kpis) return kpis;

    return rows.reduce(
      (acc, row) => {
        acc.clientes += 1;
        acc.limite_disponible += Number(row.limite_disponible || 0);
        acc.monto_disponible_score += Number(row.monto_disponible_score || 0);
        acc.exposicion_total += Number(row.exposicion_total || 0);
        acc.aptos += ["Apto cuenta corriente", "Apto con control"].includes(row.estado_crediticio) ? 1 : 0;
        acc.revision += row.requiere_revision ? 1 : 0;
        acc.bcra_consultados += row.bcra ? 1 : 0;
        acc.bcra_observados += row.bcra?.status === "ok" && (Number(row.bcra.situacion_maxima || 0) > 1 || Number(row.bcra.cheques_recientes || 0) > 0) ? 1 : 0;
        return acc;
      },
      { clientes: 0, limite_disponible: 0, monto_disponible_score: 0, exposicion_total: 0, aptos: 0, revision: 0, bcra_consultados: 0, bcra_observados: 0 }
    );
  }, [kpis, rows]);

  async function consultBcraBulk() {
    if (bulkLoading) return;
    const confirmMessage = "Esto va a consultar BCRA en forma masiva para los clientes visibles/sin consulta vigente. Conviene usarlo una vez al mes. ¿Continuar?";
    if (!window.confirm(confirmMessage)) return;

    setBulkLoading(true);
    setBulkMessage("");
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/credit/bcra/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search,
          status,
          clientIds: rows.map((row) => row.cliente_id),
          role: user.role,
          odooUserId: user.odoo_user_id || "",
          limit: rows.length || pageSize,
          force: false,
          executedBy: user.name,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo ejecutar la consulta masiva BCRA");
      setBulkMessage(`BCRA masivo finalizado: ${data.consulted || 0} consultados, ${data.skipped || 0} vigentes omitidos, ${data.invalid || 0} CUIT inválidos, ${data.observed || 0} observados.`);
      await loadAccounts({ page, limit: pageSize, append: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  }

  function downloadCSV() {
    const headers = [
      "Cliente",
      "CUIT",
      "Asesor",
      "Limite concedido",
      "Cta Cte",
      "Cheques",
      "Presupuesto mes",
      "Exposicion crediticia",
      "Disponible Odoo",
      "Limite calculado",
      "Disponible score",
      "% limite ocupado",
      "Mora maxima",
      "Deuda vencida",
      "BCRA estado",
      "BCRA deuda",
      "BCRA cheques recientes",
      "Score interno",
      "Score final",
      "Estado crediticio",
      "Accion sugerida",
      "Prioridad comercial",
      "Motivo accion",
      "Recomendacion",
    ];

    const csvRows = rows.map((row) => [
      row.cliente,
      row.cuit,
      row.asesor,
      row.limite_concedido,
      row.saldo,
      row.cheques,
      row.pedidos_venta,
      row.exposicion_total,
      row.limite_disponible,
      row.limite_calculado || 0,
      row.monto_disponible_score || 0,
      row.porcentaje_ocupado,
      row.mora_maxima,
      row.deuda_vencida,
      bcraLabel(row.bcra),
      row.bcra?.deuda_total_bcra || 0,
      row.bcra?.cheques_recientes || 0,
      row.score_interno,
      row.score,
      row.estado_crediticio,
      row.accion_sugerida,
      row.prioridad_comercial,
      row.motivo_accion,
      row.recomendacion,
    ]);

    const content = [headers, ...csvRows]
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cuenta-cliente-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="credit-page">
      <header className="page-header credit-header">
        <div>
          <span className="section-eyebrow">Crédito / {isSellMode ? "Clientes para vender" : "Cuenta Cliente"}</span>
          <h1>{isSellMode ? "Clientes para vender" : "Cuenta Cliente"}</h1>
          <p>
            {isSellMode
              ? "Cartera sugerida para accionar este mes según score, BCRA, mora y monto disponible calculado."
              : "Vista operativa de límite concedido, cuenta corriente, cheques, pedidos, exposición crediticia, score interno y BCRA."}
          </p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={downloadCSV} disabled={rows.length === 0}>
            Descargar CSV
          </button>
          <button className="secondary-button" onClick={consultBcraBulk} disabled={bulkLoading}>
            {bulkLoading ? "Consultando BCRA..." : "Consulta masiva BCRA"}
          </button>
          <button className="primary-button" onClick={() => resetAndLoad()}>
            Actualizar
          </button>
        </div>
      </header>

      <section className="credit-kpi-grid">
        <div className="credit-kpi-card dark">
          <span>Clientes visibles</span>
          <strong>{summary?.clientes || 0}</strong>
        </div>
        <div className="credit-kpi-card">
          <span title={conceptos?.exposicion || "Cta Cte + Cheques + presupuestos del mes actual"}>Exposición crediticia</span>
          <strong>{money(summary?.exposicion_total || 0)}</strong>
        </div>
        <div className="credit-kpi-card">
          <span title={conceptos?.disponibleOdoo || "Límite concedido menos exposición crediticia"}>Disponible según Odoo</span>
          <strong className={(summary?.limite_disponible || 0) < 0 ? "negative-money" : "positive-money"}>
            {money(summary?.limite_disponible || 0)}
          </strong>
        </div>
        <div className="credit-kpi-card">
          <span title="Límite calculado por score menos exposición crediticia">Disponible según score</span>
          <strong className={(summary?.monto_disponible_score || 0) <= 0 ? "negative-money" : "positive-money"}>
            {money(summary?.monto_disponible_score || 0)}
          </strong>
        </div>
        <div className="credit-kpi-card">
          <span>Aptos para vender</span>
          <strong>{summary?.aptos || 0}</strong>
        </div>
        <div className="credit-kpi-card">
          <span>Revisión</span>
          <strong>{summary?.revision || 0}</strong>
        </div>
        <div className="credit-kpi-card">
          <span>BCRA observados</span>
          <strong>{summary?.bcra_observados || 0}</strong>
          <small>{summary?.bcra_consultados || 0} consultados</small>
        </div>
      </section>

      <section className="credit-filters-panel">
        <input
          placeholder="Buscar cliente o CUIT..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") resetAndLoad();
          }}
        />

        <select value={status} onChange={(event) => handleStatusChange(event.target.value)}>
          <option>Cartera comercial</option>
          <option>Todos</option>
          <option>Para vender</option>
          <option>Aptos</option>
          <option>Disponible score</option>
          <option>Revisión</option>
          <option>Bloqueados</option>
          <option>Excedidos</option>
          <option>Sin límite Odoo</option>
          <option>Exposición sin límite</option>
          <option>Con presupuesto mes</option>
          <option>Mora +30</option>
          <option>BCRA observados</option>
          <option>Sin BCRA</option>
          <option>Sin asesor</option>
          <option>Datos incompletos</option>
        </select>

        <select value={pageSize} onChange={(event) => handlePageSizeChange(event.target.value)}>
          <option value="100">100 por página</option>
          <option value="300">300 por página</option>
          <option value="500">500 por página</option>
          <option value="1000">1000 por página</option>
        </select>

        <button className="primary-button" onClick={() => resetAndLoad()}>
          Buscar
        </button>
      </section>

      <section className="credit-explain-strip">
        <strong>Cómo leer Cuenta Cliente</strong>
        <span>{conceptos?.exposicion || "Exposición crediticia = Cta Cte + Cheques + presupuestos del mes actual."}</span>
        <span>{conceptos?.disponibleOdoo || "Disponible según Odoo = Límite concedido - exposición."}</span>
        <span>{conceptos?.pedidosVenta || "Pedidos venta solo toma presupuestos del mes actual."}</span>
      </section>

      {error && <div className="error-banner">{error}</div>}
      {bulkMessage && <div className="success-banner">{bulkMessage}</div>}

      <section className="credit-table-card">
        <div className="credit-table-title">
          <div>
            <h2>{isSellMode ? "Cartera sugerida para vender" : "Cartera crediticia"}</h2>
            <p>{isSellMode
              ? "Clientes aptos o accionables según score, monto disponible y estado de riesgo."
              : "Basado en la lógica actual del tablero: Cta Cte + Cheques + presupuestos del mes actual. No incluye presupuestos cancelados, bloqueados, facturados ni historial completo."}</p>
          </div>
          <div className="credit-pagination-info">
            {pagination && <span>Página {pagination.page} · {pagination.count} visibles · base {pagination.total_base}</span>}
            {loading && <span className="credit-loading">Cargando...</span>}
          </div>
        </div>

        <div className="credit-table-wrapper">
          <table className="credit-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Asesor</th>
                <th>Límite concedido</th>
                <th>Cta Cte</th>
                <th>Cheques</th>
                <th>Presupuesto mes</th>
                <th>Exposición crediticia</th>
                <th>Disponible Odoo</th>
                <th>Disponible score</th>
                <th>% ocupado</th>
                <th>Mora máx.</th>
                <th>BCRA</th>
                <th>Score</th>
                <th>Estado</th>
                <th>Acción sugerida</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.cliente_id}>
                  <td>
                    <strong>{row.cliente}</strong>
                    <span>{row.cuit || "Sin CUIT"}</span>
                  </td>
                  <td>{row.asesor}</td>
                  <td>{money(row.limite_concedido)}</td>
                  <td>{money(row.saldo)}</td>
                  <td>{money(row.cheques)}</td>
                  <td title={row.criterio_pedidos_venta || conceptos?.pedidosVenta || "Solo presupuestos del mes actual"}>{money(row.pedidos_venta)}</td>
                  <td title={row.explicacion_exposicion || conceptos?.exposicion || "Cta Cte + Cheques + Presupuesto mes"}>{money(row.exposicion_total)}</td>
                  <td className={row.limite_disponible < 0 ? "negative-money" : "positive-money"} title={row.explicacion_disponible_odoo || conceptos?.disponibleOdoo || "Límite Odoo - exposición"}>
                    {money(row.limite_disponible)}
                  </td>
                  <td className={(row.monto_disponible_score || 0) <= 0 ? "negative-money" : "positive-money"} title={row.motivo || ""}>
                    {money(row.monto_disponible_score || 0)}
                    {row.limite_calculado ? <span>Base {money(row.limite_calculado)}</span> : null}
                  </td>
                  <td>{pct(row.porcentaje_ocupado)}</td>
                  <td>
                    <span className={row.mora_maxima > 30 ? "credit-chip red" : row.mora_maxima > 0 ? "credit-chip yellow" : "credit-chip green"}>
                      {row.mora_maxima || 0} días
                    </span>
                  </td>
                  <td>
                    <span className={bcraChipClass(row.bcra)}>{bcraLabel(row.bcra)}</span>
                  </td>
                  <td>
                    <strong>{row.score}</strong>
                    {row.bcra_impacto ? <span>BCRA {row.bcra_impacto}</span> : null}
                  </td>
                  <td>
                    <span className={scoreClass(row.score_color)}>{row.estado_crediticio}</span>
                  </td>
                  <td title={row.motivo_accion || ""}>
                    <strong>{row.accion_sugerida || "-"}</strong>
                    {row.prioridad_comercial ? <span>{row.prioridad_comercial}</span> : null}
                  </td>
                  <td>
                    <button className="mini-action primary" onClick={() => setSelectedClient(row.cliente_id)}>
                      Ver ficha
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan="16">No hay clientes para mostrar con los filtros actuales.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="credit-pagination-controls">
          <button
            className="secondary-button"
            disabled={loading || page <= 1}
            onClick={() => loadAccounts({ page: Math.max(1, page - 1), limit: pageSize, append: false })}
          >
            Página anterior
          </button>
          <span>Página {pagination?.page || page}</span>
          <button
            className="secondary-button"
            disabled={loading || !pagination?.has_more}
            onClick={() => loadAccounts({ page: page + 1, limit: pageSize, append: false })}
          >
            Página siguiente
          </button>
          <button
            className="secondary-button"
            disabled={loading || !pagination?.has_more}
            onClick={() => loadAccounts({ page: page + 1, limit: pageSize, append: true })}
          >
            Cargar más
          </button>
        </div>
      </section>

      {selectedClient && (
        <CreditAccountDetail clienteId={selectedClient} onClose={() => setSelectedClient(null)} />
      )}
    </section>
  );
}

export default CreditAccounts;
