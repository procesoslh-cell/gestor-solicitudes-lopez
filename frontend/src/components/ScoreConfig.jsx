import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const emptyPolicy = {
  id: "",
  name: "",
  description: "",
  baseScore: 1000,
  newClientLimit: 1500000,
  buckets: [],
  rules: {
    mora: [],
    deudaVencidaVsPromedio: [],
    limiteOcupado: [],
    clienteNuevo: { monthsWithoutSales: 12, points: -80, reviewLimitOver: 1500000 },
    datosIncompletos: { noCuit: -60, noAsesor: -20 },
    limiteCalculado: {
      enabled: true,
      invoiceCount: 3,
      minInvoices: 3,
      multiplier: 1,
      minScore: 700,
      allowReview: false,
      requireBcraOk: false,
      maxNewClientLimit: 1500000,
      roundTo: 1000,
      subtractExposure: true,
    },
    bcra: {
      maxCacheDays: 30,
      situationPenalties: {},
      historicalSituationOver1: { label: "BCRA histórico con situación mayor a 1", points: -60, review: true, block: false },
      recentRejectedCheck: { label: "Cheque rechazado reciente BCRA", days: 180, points: -250, review: true, block: false },
      unpaidRejectedCheck: { label: "Cheque rechazado pendiente de regularización", points: -350, review: false, block: true },
      invalidCuit: { label: "CUIT inválido para consultar BCRA", points: -80, review: true, block: false },
    },
  },
};

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolValue(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function RuleTable({ title, subtitle, rules, onChange, percentMode = false }) {
  function updateRule(index, field, value) {
    const next = [...(rules || [])];
    next[index] = {
      ...next[index],
      [field]: field === "review" || field === "block" ? boolValue(value) : field === "label" ? value : numberOrZero(value),
    };
    onChange(next);
  }

  return (
    <div className="score-config-card wide">
      <div className="score-config-card-header">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      <div className="score-config-table-wrap">
        <table className="score-config-table">
          <thead>
            <tr>
              <th>Regla</th>
              <th>Mín.</th>
              <th>Máx.</th>
              <th>Puntos</th>
              <th>Revisión</th>
              <th>Bloquea</th>
            </tr>
          </thead>
          <tbody>
            {(rules || []).map((rule, index) => (
              <tr key={rule.key || index}>
                <td>
                  <input value={rule.label || ""} onChange={(event) => updateRule(index, "label", event.target.value)} />
                </td>
                <td>
                  <input
                    type="number"
                    step={percentMode ? "0.01" : "1"}
                    value={rule.min ?? 0}
                    onChange={(event) => updateRule(index, "min", event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step={percentMode ? "0.01" : "1"}
                    value={rule.max ?? 0}
                    onChange={(event) => updateRule(index, "max", event.target.value)}
                  />
                </td>
                <td>
                  <input type="number" value={rule.points ?? 0} onChange={(event) => updateRule(index, "points", event.target.value)} />
                </td>
                <td>
                  <select value={rule.review ? "true" : "false"} onChange={(event) => updateRule(index, "review", event.target.value)}>
                    <option value="false">No</option>
                    <option value="true">Sí</option>
                  </select>
                </td>
                <td>
                  <select value={rule.block ? "true" : "false"} onChange={(event) => updateRule(index, "block", event.target.value)}>
                    <option value="false">No</option>
                    <option value="true">Sí</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BucketEditor({ buckets, onChange }) {
  function updateBucket(index, field, value) {
    const next = [...(buckets || [])];
    next[index] = {
      ...next[index],
      [field]: ["min", "max"].includes(field) ? numberOrZero(value) : value,
    };
    onChange(next);
  }

  return (
    <div className="score-config-card wide">
      <h3>Matriz de decisión</h3>
      <p>Define el estado final y la recomendación según el score calculado.</p>

      <div className="score-config-table-wrap">
        <table className="score-config-table">
          <thead>
            <tr>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Estado</th>
              <th>Color</th>
              <th>Recomendación</th>
            </tr>
          </thead>
          <tbody>
            {(buckets || []).map((bucket, index) => (
              <tr key={`${bucket.label}-${index}`}>
                <td><input type="number" value={bucket.min ?? 0} onChange={(event) => updateBucket(index, "min", event.target.value)} /></td>
                <td><input type="number" value={bucket.max ?? 0} onChange={(event) => updateBucket(index, "max", event.target.value)} /></td>
                <td><input value={bucket.label || ""} onChange={(event) => updateBucket(index, "label", event.target.value)} /></td>
                <td>
                  <select value={bucket.color || "blue"} onChange={(event) => updateBucket(index, "color", event.target.value)}>
                    <option value="green">Verde</option>
                    <option value="blue">Azul</option>
                    <option value="yellow">Amarillo</option>
                    <option value="orange">Naranja</option>
                    <option value="red">Rojo</option>
                  </select>
                </td>
                <td>
                  <textarea value={bucket.recommendation || ""} onChange={(event) => updateBucket(index, "recommendation", event.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BcraPenaltyEditor({ policy, onChange }) {
  const bcra = policy.rules?.bcra || emptyPolicy.rules.bcra;

  function updateSituation(situation, field, value) {
    const next = clone(policy);
    next.rules.bcra.situationPenalties = next.rules.bcra.situationPenalties || {};
    next.rules.bcra.situationPenalties[situation] = {
      ...(next.rules.bcra.situationPenalties[situation] || {}),
      [field]: field === "review" || field === "block" ? boolValue(value) : field === "label" ? value : numberOrZero(value),
    };
    onChange(next);
  }

  function updateBcraRule(ruleKey, field, value) {
    const next = clone(policy);
    next.rules.bcra[ruleKey] = {
      ...(next.rules.bcra[ruleKey] || {}),
      [field]: field === "review" || field === "block" ? boolValue(value) : field === "label" ? value : numberOrZero(value),
    };
    onChange(next);
  }

  return (
    <div className="score-config-card wide">
      <h3>BCRA y cheques rechazados</h3>
      <p>Estas reglas se aplican sobre el score final cuando el cliente ya tiene consulta BCRA guardada.</p>

      <div className="score-config-mini-grid">
        <label>
          Vigencia de consulta BCRA en días
          <input
            type="number"
            value={bcra.maxCacheDays ?? 30}
            onChange={(event) => {
              const next = clone(policy);
              next.rules.bcra.maxCacheDays = numberOrZero(event.target.value);
              onChange(next);
            }}
          />
        </label>
        <label>
          Cheque reciente hasta días
          <input
            type="number"
            value={bcra.recentRejectedCheck?.days ?? 180}
            onChange={(event) => updateBcraRule("recentRejectedCheck", "days", event.target.value)}
          />
        </label>
      </div>

      <div className="score-config-table-wrap">
        <table className="score-config-table">
          <thead>
            <tr>
              <th>Alerta</th>
              <th>Etiqueta</th>
              <th>Puntos</th>
              <th>Revisión</th>
              <th>Bloquea</th>
            </tr>
          </thead>
          <tbody>
            {[2, 3, 4, 5, 6].map((situation) => {
              const rule = bcra.situationPenalties?.[situation] || {};
              return (
                <tr key={situation}>
                  <td>Situación {situation}</td>
                  <td><input value={rule.label || `BCRA situación ${situation}`} onChange={(event) => updateSituation(situation, "label", event.target.value)} /></td>
                  <td><input type="number" value={rule.points ?? 0} onChange={(event) => updateSituation(situation, "points", event.target.value)} /></td>
                  <td>
                    <select value={rule.review ? "true" : "false"} onChange={(event) => updateSituation(situation, "review", event.target.value)}>
                      <option value="false">No</option><option value="true">Sí</option>
                    </select>
                  </td>
                  <td>
                    <select value={rule.block ? "true" : "false"} onChange={(event) => updateSituation(situation, "block", event.target.value)}>
                      <option value="false">No</option><option value="true">Sí</option>
                    </select>
                  </td>
                </tr>
              );
            })}
            {[
              ["historicalSituationOver1", "Histórico con situación mayor a 1"],
              ["recentRejectedCheck", "Cheque rechazado reciente"],
              ["unpaidRejectedCheck", "Cheque rechazado pendiente"],
              ["invalidCuit", "CUIT inválido"],
            ].map(([key, label]) => {
              const rule = bcra[key] || {};
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td><input value={rule.label || label} onChange={(event) => updateBcraRule(key, "label", event.target.value)} /></td>
                  <td><input type="number" value={rule.points ?? 0} onChange={(event) => updateBcraRule(key, "points", event.target.value)} /></td>
                  <td>
                    <select value={rule.review ? "true" : "false"} onChange={(event) => updateBcraRule(key, "review", event.target.value)}>
                      <option value="false">No</option><option value="true">Sí</option>
                    </select>
                  </td>
                  <td>
                    <select value={rule.block ? "true" : "false"} onChange={(event) => updateBcraRule(key, "block", event.target.value)}>
                      <option value="false">No</option><option value="true">Sí</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreConfig({ user }) {
  const [policy, setPolicy] = useState(emptyPolicy);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canEdit = ["admin", "cuentas", "gerente", "jefe"].includes(user.role);

  async function loadConfig() {
    setLoading(true);
    setError("");

    try {
      const [configResponse, historyResponse] = await Promise.all([
        fetch(`${API_URL}/api/credit/score-config`),
        fetch(`${API_URL}/api/credit/score-config/history`),
      ]);
      const config = await configResponse.json();
      const historyData = await historyResponse.json();

      if (!configResponse.ok) throw new Error(config.error || "No se pudo cargar configuración de score");
      setPolicy(config.policy || emptyPolicy);
      setHistory(Array.isArray(historyData) ? historyData : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConfig();
  }, []);

  function updateRoot(field, value) {
    setPolicy((current) => ({
      ...current,
      [field]: field === "baseScore" || field === "newClientLimit" ? numberOrZero(value) : value,
    }));
  }

  function updateClienteNuevo(field, value) {
    setPolicy((current) => ({
      ...current,
      rules: {
        ...current.rules,
        clienteNuevo: {
          ...current.rules.clienteNuevo,
          [field]: numberOrZero(value),
        },
      },
    }));
  }

  function updateDatosIncompletos(field, value) {
    setPolicy((current) => ({
      ...current,
      rules: {
        ...current.rules,
        datosIncompletos: {
          ...current.rules.datosIncompletos,
          [field]: numberOrZero(value),
        },
      },
    }));
  }

  function updateLimiteCalculado(field, value) {
    setPolicy((current) => ({
      ...current,
      rules: {
        ...current.rules,
        limiteCalculado: {
          ...(current.rules.limiteCalculado || emptyPolicy.rules.limiteCalculado),
          [field]: ["enabled", "allowReview", "requireBcraOk", "subtractExposure"].includes(field) ? boolValue(value) : numberOrZero(value),
        },
      },
    }));
  }

  async function savePolicy() {
    if (!canEdit) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        ...policy,
        id: `policy_${Date.now()}`,
      };
      const response = await fetch(`${API_URL}/api/credit/score-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: payload }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "No se pudo guardar la política");

      setPolicy(data.policy);
      setMessage("Política guardada y activada. Las nuevas evaluaciones ya usan esta configuración.");
      await loadConfig();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function resetPolicy() {
    if (!canEdit || !window.confirm("¿Restaurar los valores base de la política LH Score?")) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/api/credit/score-config/reset`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo restaurar la política");
      setPolicy(data.policy);
      setMessage("Política restaurada y activada.");
      await loadConfig();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function activatePolicy(id) {
    if (!canEdit) return;

    try {
      const response = await fetch(`${API_URL}/api/credit/score-config/${id}/activate`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo activar la política");
      setMessage("Política histórica activada correctamente.");
      await loadConfig();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return <section className="score-config-page"><div className="empty-state">Cargando configuración de score...</div></section>;
  }

  return (
    <section className="score-config-page">
      <header className="page-header credit-header">
        <div>
          <span className="section-eyebrow">Crédito / Configuración</span>
          <h1>Configuración de Score</h1>
          <p>Parametrizá reglas, descuentos, bloqueos y matriz de decisión sin tocar código.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={resetPolicy} disabled={!canEdit || saving}>Restaurar base</button>
          <button className="primary-button" onClick={savePolicy} disabled={!canEdit || saving}>{saving ? "Guardando..." : "Guardar política"}</button>
        </div>
      </header>

      {!canEdit && <div className="error-banner">Tu usuario puede ver la configuración, pero no modificarla.</div>}
      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <section className="score-config-grid">
        <div className="score-config-card">
          <h3>Datos generales</h3>
          <label>Nombre de política<input value={policy.name || ""} onChange={(event) => updateRoot("name", event.target.value)} /></label>
          <label>Descripción<textarea value={policy.description || ""} onChange={(event) => updateRoot("description", event.target.value)} /></label>
          <label>Score base<input type="number" value={policy.baseScore || 1000} onChange={(event) => updateRoot("baseScore", event.target.value)} /></label>
          <label>Tope cliente nuevo sin revisión<input type="number" value={policy.newClientLimit || 1500000} onChange={(event) => updateRoot("newClientLimit", event.target.value)} /></label>
        </div>

        <div className="score-config-card">
          <h3>Cliente nuevo y datos</h3>
          <label>Meses sin compra para cliente nuevo<input type="number" value={policy.rules.clienteNuevo?.monthsWithoutSales ?? 12} onChange={(event) => updateClienteNuevo("monthsWithoutSales", event.target.value)} /></label>
          <label>Descuento cliente nuevo<input type="number" value={policy.rules.clienteNuevo?.points ?? -80} onChange={(event) => updateClienteNuevo("points", event.target.value)} /></label>
          <label>Límite cliente nuevo que obliga revisión<input type="number" value={policy.rules.clienteNuevo?.reviewLimitOver ?? 1500000} onChange={(event) => updateClienteNuevo("reviewLimitOver", event.target.value)} /></label>
          <label>Descuento sin CUIT<input type="number" value={policy.rules.datosIncompletos?.noCuit ?? -60} onChange={(event) => updateDatosIncompletos("noCuit", event.target.value)} /></label>
          <label>Descuento sin asesor<input type="number" value={policy.rules.datosIncompletos?.noAsesor ?? -20} onChange={(event) => updateDatosIncompletos("noAsesor", event.target.value)} /></label>
        </div>

        <div className="score-config-card">
          <h3>Límite calculado automático</h3>
          <p>Calcula un límite sugerido con el promedio de las últimas facturas y lo muestra como monto disponible por score.</p>
          <label>Activo
            <select value={policy.rules.limiteCalculado?.enabled ? "true" : "false"} onChange={(event) => updateLimiteCalculado("enabled", event.target.value)}>
              <option value="true">Sí</option><option value="false">No</option>
            </select>
          </label>
          <label>Últimas facturas a promediar<input type="number" value={policy.rules.limiteCalculado?.invoiceCount ?? 3} onChange={(event) => updateLimiteCalculado("invoiceCount", event.target.value)} /></label>
          <label>Mínimo de facturas requeridas<input type="number" value={policy.rules.limiteCalculado?.minInvoices ?? 3} onChange={(event) => updateLimiteCalculado("minInvoices", event.target.value)} /></label>
          <label>Multiplicador del promedio<input type="number" step="0.1" value={policy.rules.limiteCalculado?.multiplier ?? 1} onChange={(event) => updateLimiteCalculado("multiplier", event.target.value)} /></label>
          <label>Score mínimo para habilitar<input type="number" value={policy.rules.limiteCalculado?.minScore ?? 700} onChange={(event) => updateLimiteCalculado("minScore", event.target.value)} /></label>
          <label>Tope para cliente nuevo<input type="number" value={policy.rules.limiteCalculado?.maxNewClientLimit ?? 1500000} onChange={(event) => updateLimiteCalculado("maxNewClientLimit", event.target.value)} /></label>
          <label>Redondear a<input type="number" value={policy.rules.limiteCalculado?.roundTo ?? 1000} onChange={(event) => updateLimiteCalculado("roundTo", event.target.value)} /></label>
          <label>Permitir si requiere revisión
            <select value={policy.rules.limiteCalculado?.allowReview ? "true" : "false"} onChange={(event) => updateLimiteCalculado("allowReview", event.target.value)}>
              <option value="false">No</option><option value="true">Sí</option>
            </select>
          </label>
          <label>Exigir BCRA ok
            <select value={policy.rules.limiteCalculado?.requireBcraOk ? "true" : "false"} onChange={(event) => updateLimiteCalculado("requireBcraOk", event.target.value)}>
              <option value="false">No</option><option value="true">Sí</option>
            </select>
          </label>
        </div>
      </section>

      <BucketEditor buckets={policy.buckets || []} onChange={(buckets) => setPolicy((current) => ({ ...current, buckets }))} />

      <RuleTable
        title="Mora interna"
        subtitle="Regla principal de Cuentas Corrientes. Más de 30 días debería mandar a revisión."
        rules={policy.rules.mora || []}
        onChange={(rules) => setPolicy((current) => ({ ...current, rules: { ...current.rules, mora: rules } }))}
      />

      <RuleTable
        title="Deuda vencida vs compra promedio mensual"
        subtitle="Usá valores decimales: 0.02 = 2%, 0.10 = 10%, 0.25 = 25%."
        rules={policy.rules.deudaVencidaVsPromedio || []}
        onChange={(rules) => setPolicy((current) => ({ ...current, rules: { ...current.rules, deudaVencidaVsPromedio: rules } }))}
        percentMode
      />

      <RuleTable
        title="Ocupación de límite"
        subtitle="Usá valores decimales: 0.85 = 85%, 1.00 = 100%, 1.20 = 120%."
        rules={policy.rules.limiteOcupado || []}
        onChange={(rules) => setPolicy((current) => ({ ...current, rules: { ...current.rules, limiteOcupado: rules } }))}
        percentMode
      />

      <BcraPenaltyEditor policy={policy} onChange={setPolicy} />

      <div className="score-config-card wide">
        <h3>Versiones guardadas</h3>
        <p>Cada guardado crea una nueva política activa para conservar historial.</p>
        <div className="score-history-list">
          {(history || []).map((item) => (
            <div key={item.id} className={item.is_active ? "score-history-row active" : "score-history-row"}>
              <div>
                <strong>{item.name}</strong>
                <p>{item.description || "Sin descripción"} · Base {item.base_score} · {item.updated_at || item.created_at}</p>
              </div>
              {item.is_active ? <span>Activa</span> : <button className="mini-action" onClick={() => activatePolicy(item.id)} disabled={!canEdit}>Activar</button>}
            </div>
          ))}
          {history.length === 0 && <div className="empty-state">Todavía no hay historial de políticas.</div>}
        </div>
      </div>
    </section>
  );
}

export default ScoreConfig;
