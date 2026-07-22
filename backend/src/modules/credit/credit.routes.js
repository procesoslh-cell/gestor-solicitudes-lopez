const axios = require("axios");
const DEFAULT_POLICY = {
  id: "lh-score-v1",
  name: "Política LH Score v1",
  baseScore: 1000,
  newClientLimit: 1500000,
  buckets: [
    { min: 850, max: 1000, label: "Apto cuenta corriente", color: "green", recommendation: "Puede vender a cuenta corriente dentro del límite disponible." },
    { min: 700, max: 849, label: "Apto con control", color: "blue", recommendation: "Puede vender con control de límite y seguimiento de deuda." },
    { min: 550, max: 699, label: "Revisión cuentas corrientes", color: "yellow", recommendation: "Requiere revisión antes de operar a crédito." },
    { min: 400, max: 549, label: "Aprobación gerencial", color: "orange", recommendation: "Solo avanzar con autorización de gerencia/cuentas corrientes." },
    { min: 0, max: 399, label: "No cuenta corriente", color: "red", recommendation: "Sugerir contado o regularización antes de vender." },
  ],
  rules: {
    mora: [
      { key: "mora_1_15", label: "Mora hasta 15 días", min: 1, max: 15, points: -30 },
      { key: "mora_16_30", label: "Mora de 16 a 30 días", min: 16, max: 30, points: -80 },
      { key: "mora_31_60", label: "Mora mayor a 30 días", min: 31, max: 60, points: -180, review: true },
      { key: "mora_60", label: "Mora mayor a 60 días", min: 61, max: 9999, points: -300, block: true },
    ],
    deudaVencidaVsPromedio: [
      { key: "dv_2_10", label: "Deuda vencida entre 2% y 10% del promedio mensual", min: 0.02, max: 0.10, points: -40 },
      { key: "dv_10_25", label: "Deuda vencida entre 10% y 25% del promedio mensual", min: 0.10, max: 0.25, points: -90 },
      { key: "dv_25_50", label: "Deuda vencida mayor al 25% del promedio mensual", min: 0.25, max: 0.50, points: -160, review: true },
      { key: "dv_50", label: "Deuda vencida mayor al 50% del promedio mensual", min: 0.50, max: 9999, points: -220, review: true },
    ],
    limiteOcupado: [
      { key: "lim_70_85", label: "Límite ocupado entre 70% y 85%", min: 0.70, max: 0.85, points: -30 },
      { key: "lim_85_100", label: "Límite ocupado entre 85% y 100%", min: 0.85, max: 1.00, points: -70 },
      { key: "lim_100_120", label: "Límite excedido", min: 1.00, max: 1.20, points: -150, review: true },
      { key: "lim_120", label: "Límite excedido más de 20%", min: 1.20, max: 9999, points: -250, review: true },
    ],
    clienteNuevo: { monthsWithoutSales: 12, points: -80, reviewLimitOver: 1500000 },
    datosIncompletos: { noCuit: -60, noAsesor: -20 },
    bcra: {
      maxCacheDays: 30,
      situationPenalties: {
        2: { points: -150, review: true, label: "BCRA situación 2" },
        3: { points: -300, review: true, label: "BCRA situación 3" },
        4: { points: -500, block: true, label: "BCRA situación 4" },
        5: { points: -650, block: true, label: "BCRA situación 5" },
        6: { points: -650, block: true, label: "BCRA situación 6" },
      },
      historicalSituationOver1: { points: -60, review: true, label: "BCRA histórico con situación mayor a 1" },
      recentRejectedCheck: { days: 180, points: -250, review: true, label: "Cheque rechazado reciente BCRA" },
      unpaidRejectedCheck: { points: -350, block: true, label: "Cheque rechazado pendiente de regularización" },
      invalidCuit: { points: -80, review: true, label: "CUIT inválido para consultar BCRA" },
    },
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
  },
};


function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep(base, override) {
  if (!isPlainObject(base)) return override === undefined ? base : override;
  const output = { ...base };
  if (!isPlainObject(override)) return output;

  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      output[key] = value;
    } else if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeDeep(output[key], value);
    } else if (value !== undefined) {
      output[key] = value;
    }
  }

  return output;
}

function normalizeRule(rule, fallback = {}) {
  return {
    key: String(rule?.key || fallback.key || cryptoRandomKey()),
    label: String(rule?.label || fallback.label || "Regla"),
    min: Number(rule?.min ?? fallback.min ?? 0),
    max: Number(rule?.max ?? fallback.max ?? 0),
    points: Number(rule?.points ?? fallback.points ?? 0),
    review: Boolean(rule?.review ?? fallback.review ?? false),
    block: Boolean(rule?.block ?? fallback.block ?? false),
  };
}

function cryptoRandomKey() {
  return `rule_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRangeRules(rules, fallback) {
  const source = Array.isArray(rules) && rules.length ? rules : fallback;
  return source.map((rule, index) => normalizeRule(rule, fallback[index] || {}));
}

function normalizeBcraPenalty(rule, fallback) {
  return {
    label: String(rule?.label || fallback.label || "Alerta BCRA"),
    points: Number(rule?.points ?? fallback.points ?? 0),
    review: Boolean(rule?.review ?? fallback.review ?? false),
    block: Boolean(rule?.block ?? fallback.block ?? false),
  };
}

function normalizePolicyPayload(rawPolicy = {}) {
  const merged = mergeDeep(deepClone(DEFAULT_POLICY), rawPolicy || {});

  merged.id = String(merged.id || `policy_${Date.now()}`);
  merged.name = String(merged.name || "Política de score");
  merged.description = String(merged.description || "");
  merged.baseScore = Number(merged.baseScore || DEFAULT_POLICY.baseScore);
  merged.newClientLimit = Number(merged.newClientLimit || DEFAULT_POLICY.newClientLimit);

  merged.buckets = (Array.isArray(merged.buckets) && merged.buckets.length ? merged.buckets : DEFAULT_POLICY.buckets)
    .map((bucket, index) => ({
      min: Number(bucket.min ?? DEFAULT_POLICY.buckets[index]?.min ?? 0),
      max: Number(bucket.max ?? DEFAULT_POLICY.buckets[index]?.max ?? 1000),
      label: String(bucket.label || DEFAULT_POLICY.buckets[index]?.label || "Rango"),
      color: String(bucket.color || DEFAULT_POLICY.buckets[index]?.color || "blue"),
      recommendation: String(bucket.recommendation || DEFAULT_POLICY.buckets[index]?.recommendation || "Revisar política de crédito."),
    }))
    .sort((a, b) => b.min - a.min);

  merged.rules = merged.rules || {};
  merged.rules.mora = normalizeRangeRules(merged.rules.mora, DEFAULT_POLICY.rules.mora);
  merged.rules.deudaVencidaVsPromedio = normalizeRangeRules(
    merged.rules.deudaVencidaVsPromedio,
    DEFAULT_POLICY.rules.deudaVencidaVsPromedio
  );
  merged.rules.limiteOcupado = normalizeRangeRules(merged.rules.limiteOcupado, DEFAULT_POLICY.rules.limiteOcupado);

  merged.rules.clienteNuevo = {
    monthsWithoutSales: Number(merged.rules.clienteNuevo?.monthsWithoutSales ?? DEFAULT_POLICY.rules.clienteNuevo.monthsWithoutSales),
    points: Number(merged.rules.clienteNuevo?.points ?? DEFAULT_POLICY.rules.clienteNuevo.points),
    reviewLimitOver: Number(merged.rules.clienteNuevo?.reviewLimitOver ?? DEFAULT_POLICY.rules.clienteNuevo.reviewLimitOver),
  };

  merged.rules.datosIncompletos = {
    noCuit: Number(merged.rules.datosIncompletos?.noCuit ?? DEFAULT_POLICY.rules.datosIncompletos.noCuit),
    noAsesor: Number(merged.rules.datosIncompletos?.noAsesor ?? DEFAULT_POLICY.rules.datosIncompletos.noAsesor),
  };

  const incomingBcra = merged.rules.bcra || {};
  merged.rules.bcra = {
    maxCacheDays: Number(incomingBcra.maxCacheDays ?? DEFAULT_POLICY.rules.bcra.maxCacheDays),
    situationPenalties: {},
    historicalSituationOver1: normalizeBcraPenalty(incomingBcra.historicalSituationOver1, DEFAULT_POLICY.rules.bcra.historicalSituationOver1),
    recentRejectedCheck: {
      ...normalizeBcraPenalty(incomingBcra.recentRejectedCheck, DEFAULT_POLICY.rules.bcra.recentRejectedCheck),
      days: Number(incomingBcra.recentRejectedCheck?.days ?? DEFAULT_POLICY.rules.bcra.recentRejectedCheck.days),
    },
    unpaidRejectedCheck: normalizeBcraPenalty(incomingBcra.unpaidRejectedCheck, DEFAULT_POLICY.rules.bcra.unpaidRejectedCheck),
    invalidCuit: normalizeBcraPenalty(incomingBcra.invalidCuit, DEFAULT_POLICY.rules.bcra.invalidCuit),
  };

  for (const situation of [2, 3, 4, 5, 6]) {
    merged.rules.bcra.situationPenalties[situation] = normalizeBcraPenalty(
      incomingBcra.situationPenalties?.[situation],
      DEFAULT_POLICY.rules.bcra.situationPenalties[situation]
    );
  }

  const incomingCalculatedLimit = merged.rules.limiteCalculado || {};
  merged.rules.limiteCalculado = {
    enabled: Boolean(incomingCalculatedLimit.enabled ?? DEFAULT_POLICY.rules.limiteCalculado.enabled),
    invoiceCount: Math.max(1, Number(incomingCalculatedLimit.invoiceCount ?? DEFAULT_POLICY.rules.limiteCalculado.invoiceCount)),
    minInvoices: Math.max(1, Number(incomingCalculatedLimit.minInvoices ?? DEFAULT_POLICY.rules.limiteCalculado.minInvoices)),
    multiplier: Number(incomingCalculatedLimit.multiplier ?? DEFAULT_POLICY.rules.limiteCalculado.multiplier),
    minScore: Number(incomingCalculatedLimit.minScore ?? DEFAULT_POLICY.rules.limiteCalculado.minScore),
    allowReview: Boolean(incomingCalculatedLimit.allowReview ?? DEFAULT_POLICY.rules.limiteCalculado.allowReview),
    requireBcraOk: Boolean(incomingCalculatedLimit.requireBcraOk ?? DEFAULT_POLICY.rules.limiteCalculado.requireBcraOk),
    maxNewClientLimit: Number(incomingCalculatedLimit.maxNewClientLimit ?? DEFAULT_POLICY.rules.limiteCalculado.maxNewClientLimit),
    roundTo: Math.max(1, Number(incomingCalculatedLimit.roundTo ?? DEFAULT_POLICY.rules.limiteCalculado.roundTo)),
    subtractExposure: Boolean(incomingCalculatedLimit.subtractExposure ?? DEFAULT_POLICY.rules.limiteCalculado.subtractExposure),
  };

  return merged;
}

function ensureDefaultPolicy(db) {
  const existing = db.prepare(`SELECT id FROM credit_score_policies WHERE is_active = 1 LIMIT 1`).get();
  if (existing) return;

  const policy = normalizePolicyPayload(DEFAULT_POLICY);
  db.prepare(`
    INSERT INTO credit_score_policies (name, description, base_score, is_active, payload, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  `).run(policy.name, policy.description || "Política inicial del sistema", policy.baseScore, JSON.stringify(policy));
}

function getActivePolicy(db) {
  try {
    ensureDefaultPolicy(db);
    const row = db.prepare(`
      SELECT *
      FROM credit_score_policies
      WHERE is_active = 1
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT 1
    `).get();

    if (!row) return normalizePolicyPayload(DEFAULT_POLICY);
    const payload = parseJson(row.payload, DEFAULT_POLICY);
    return normalizePolicyPayload({
      ...payload,
      id: payload?.id || `policy_${row.id}`,
      name: row.name || payload?.name,
      description: row.description || payload?.description,
      baseScore: row.base_score || payload?.baseScore,
      dbId: row.id,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    });
  } catch (error) {
    console.warn("No se pudo cargar política activa de score:", error.message);
    return normalizePolicyPayload(DEFAULT_POLICY);
  }
}

function saveNewActivePolicy(db, policyPayload) {
  const policy = normalizePolicyPayload(policyPayload);
  db.prepare(`UPDATE credit_score_policies SET is_active = 0 WHERE is_active = 1`).run();
  const result = db.prepare(`
    INSERT INTO credit_score_policies (name, description, base_score, is_active, payload, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  `).run(policy.name, policy.description || "", policy.baseScore, JSON.stringify(policy));
  return { ...policy, dbId: result.lastInsertRowid };
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function sanitizeIdentification(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidIdentification(value) {
  return sanitizeIdentification(value).length === 11;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function daysBetween(dateValue, now = new Date()) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function getBucket(score, policy = DEFAULT_POLICY) {
  return (
    policy.buckets.find((bucket) => score >= bucket.min && score <= bucket.max) ||
    policy.buckets[policy.buckets.length - 1]
  );
}

function roundTo(value, step = 1) {
  const numericStep = Math.max(1, toNumber(step));
  return Math.round(toNumber(value) / numericStep) * numericStep;
}

function calculateScoreLimit(account, evaluation, policy = DEFAULT_POLICY) {
  const rule = policy.rules?.limiteCalculado || DEFAULT_POLICY.rules.limiteCalculado;
  const promedioFacturas = toNumber(account.promedio_ultimas_facturas);
  const cantidadFacturas = toNumber(account.cantidad_facturas_promedio);
  const exposicionTotal = toNumber(account.exposicion_total);
  const score = toNumber(evaluation?.score);
  const isNewClient = Boolean(evaluation?.metrics?.isNewClient);
  const bcra = account.bcra || account.bcra_summary || null;

  const result = {
    enabled: Boolean(rule.enabled),
    eligible: false,
    limite_calculado: 0,
    disponible_calculado: 0,
    monto_disponible_score: 0,
    promedio_ultimas_facturas: roundMoney(promedioFacturas),
    cantidad_facturas_promedio: cantidadFacturas,
    motivo: "Regla de límite calculado desactivada",
  };

  if (!rule.enabled) return result;

  if (cantidadFacturas < rule.minInvoices) {
    result.motivo = `Faltan facturas para calcular límite automático: ${cantidadFacturas}/${rule.minInvoices}`;
    return result;
  }

  if (score < rule.minScore) {
    result.motivo = `Score inferior al mínimo configurado (${score}/${rule.minScore})`;
    return result;
  }

  if (evaluation?.hasBlockingRule) {
    result.motivo = "Cliente bloqueado por reglas de score";
    return result;
  }

  if (evaluation?.requiresReview && !rule.allowReview) {
    result.motivo = "Cliente requiere revisión; no habilita límite automático";
    return result;
  }

  if (rule.requireBcraOk) {
    const bcraOk = bcra?.status === "ok" && toNumber(bcra.situacion_maxima) <= 1 && toNumber(bcra.cheques_recientes) <= 0 && toNumber(bcra.cheques_impagos) <= 0;
    if (!bcraOk) {
      result.motivo = "Requiere BCRA consultado y sin alertas";
      return result;
    }
  }

  let calculatedLimit = promedioFacturas * toNumber(rule.multiplier || 1);
  if (isNewClient && toNumber(rule.maxNewClientLimit) > 0) {
    calculatedLimit = Math.min(calculatedLimit, toNumber(rule.maxNewClientLimit));
  }

  calculatedLimit = roundTo(calculatedLimit, rule.roundTo);
  const available = rule.subtractExposure ? calculatedLimit - exposicionTotal : calculatedLimit;

  result.eligible = calculatedLimit > 0;
  result.limite_calculado = roundMoney(calculatedLimit);
  result.disponible_calculado = roundMoney(available);
  result.monto_disponible_score = roundMoney(Math.max(0, available));
  result.motivo = result.eligible
    ? `Límite calculado por promedio de últimas ${cantidadFacturas} facturas × ${rule.multiplier}`
    : "No se pudo calcular un límite automático";

  return result;
}

function applyRangeRules({ value, rules, applied }) {
  let points = 0;
  let block = false;
  let review = false;

  for (const rule of rules || []) {
    if (value > rule.min && value <= rule.max) {
      points += toNumber(rule.points);
      block = block || Boolean(rule.block);
      review = review || Boolean(rule.review);
      applied.push({
        key: rule.key,
        label: rule.label,
        points: toNumber(rule.points),
        block: Boolean(rule.block),
        review: Boolean(rule.review),
      });
      break;
    }
  }

  return { points, block, review };
}

function evaluateCredit(account, policy = DEFAULT_POLICY) {
  const applied = [];
  let score = policy.baseScore;
  let hasBlockingRule = false;
  let requiresReview = false;

  const moraMaxima = toNumber(account.mora_maxima);
  const deudaVencida = toNumber(account.deuda_vencida);
  const promedioMensual = toNumber(account.compra_promedio_mensual);
  const limiteConcedido = toNumber(account.limite_concedido);
  const exposicionTotal = toNumber(account.exposicion_total);
  const limiteOcupado = limiteConcedido > 0 ? exposicionTotal / limiteConcedido : null;
  const deudaVsPromedio = promedioMensual > 0 ? deudaVencida / promedioMensual : 0;

  const mora = applyRangeRules({
    value: moraMaxima,
    rules: policy.rules.mora,
    applied,
  });
  score += mora.points;
  hasBlockingRule = hasBlockingRule || mora.block;
  requiresReview = requiresReview || mora.review;

  const deuda = applyRangeRules({
    value: deudaVsPromedio,
    rules: policy.rules.deudaVencidaVsPromedio,
    applied,
  });
  score += deuda.points;
  hasBlockingRule = hasBlockingRule || deuda.block;
  requiresReview = requiresReview || deuda.review;

  if (limiteOcupado !== null) {
    const limite = applyRangeRules({
      value: limiteOcupado,
      rules: policy.rules.limiteOcupado,
      applied,
    });
    score += limite.points;
    hasBlockingRule = hasBlockingRule || limite.block;
    requiresReview = requiresReview || limite.review;
  }

  const mesesSinCompra = toNumber(account.meses_sin_compra);
  const totalVentas12m = toNumber(account.total_ventas_12m);
  const isNewClient = totalVentas12m <= 0 || mesesSinCompra >= policy.rules.clienteNuevo.monthsWithoutSales;

  if (isNewClient) {
    score += policy.rules.clienteNuevo.points;
    applied.push({
      key: "cliente_nuevo",
      label: "Cliente nuevo o sin ventas en los últimos 12 meses",
      points: policy.rules.clienteNuevo.points,
      review: true,
      block: false,
    });
    requiresReview = true;

    if (limiteConcedido > policy.rules.clienteNuevo.reviewLimitOver) {
      applied.push({
        key: "cliente_nuevo_limite_alto",
        label: `Cliente nuevo con límite superior a $${policy.rules.clienteNuevo.reviewLimitOver.toLocaleString("es-AR")}`,
        points: 0,
        review: true,
        block: false,
      });
      requiresReview = true;
    }
  }

  if (!normalizeText(account.cuit)) {
    score += policy.rules.datosIncompletos.noCuit;
    applied.push({
      key: "sin_cuit",
      label: "CUIT no informado",
      points: policy.rules.datosIncompletos.noCuit,
      review: true,
      block: false,
    });
    requiresReview = true;
  }

  if (!normalizeText(account.asesor)) {
    score += policy.rules.datosIncompletos.noAsesor;
    applied.push({
      key: "sin_asesor",
      label: "Cliente sin asesor asignado",
      points: policy.rules.datosIncompletos.noAsesor,
      review: true,
      block: false,
    });
    requiresReview = true;
  }

  const scoreInterno = Math.max(0, Math.min(policy.baseScore, Math.round(score)));
  let bcraImpact = { points: 0, applied: false, status: "sin_consulta" };
  const bcra = account.bcra || account.bcra_summary || null;

  if (bcra?.status === "invalid_cuit") {
    const rule = policy.rules.bcra.invalidCuit;
    score += rule.points;
    bcraImpact = { points: rule.points, applied: true, status: "invalid_cuit" };
    applied.push({ key: "bcra_invalid_cuit", label: rule.label, points: rule.points, review: true, block: false });
    requiresReview = true;
  }

  if (bcra?.status === "ok") {
    bcraImpact.applied = true;
    bcraImpact.status = "ok";

    const situation = Number(bcra.situacion_maxima || 0);
    const situationRule = policy.rules.bcra.situationPenalties[situation];
    if (situationRule) {
      score += situationRule.points;
      bcraImpact.points += situationRule.points;
      applied.push({
        key: `bcra_situacion_${situation}`,
        label: situationRule.label,
        points: situationRule.points,
        review: Boolean(situationRule.review),
        block: Boolean(situationRule.block),
      });
      requiresReview = requiresReview || Boolean(situationRule.review);
      hasBlockingRule = hasBlockingRule || Boolean(situationRule.block);
    }

    if (Number(bcra.historico_peor_situacion || 0) > 1 && situation <= 1) {
      const rule = policy.rules.bcra.historicalSituationOver1;
      score += rule.points;
      bcraImpact.points += rule.points;
      applied.push({ key: "bcra_historico_obs", label: rule.label, points: rule.points, review: true, block: false });
      requiresReview = true;
    }

    if (Number(bcra.cheques_recientes || 0) > 0) {
      const rule = policy.rules.bcra.recentRejectedCheck;
      score += rule.points;
      bcraImpact.points += rule.points;
      applied.push({ key: "bcra_cheque_reciente", label: rule.label, points: rule.points, review: true, block: false });
      requiresReview = true;
    }

    if (Number(bcra.cheques_impagos || 0) > 0) {
      const rule = policy.rules.bcra.unpaidRejectedCheck;
      score += rule.points;
      bcraImpact.points += rule.points;
      applied.push({ key: "bcra_cheque_impago", label: rule.label, points: rule.points, review: false, block: true });
      hasBlockingRule = true;
    }
  }

  score = Math.max(0, Math.min(policy.baseScore, Math.round(score)));

  const bucket = getBucket(score, policy);
  let estado = bucket.label;
  let recommendation = bucket.recommendation;
  let color = bucket.color;

  if (hasBlockingRule) {
    estado = "Bloqueado / solo contado";
    recommendation = "Regularizar la cuenta antes de vender a cuenta corriente.";
    color = "red";
  } else if (requiresReview && score >= 550) {
    estado = "Revisión cuentas corrientes";
    recommendation = "Requiere revisión de Cuentas Corrientes antes de aprobar crédito o aumento de límite.";
    color = "yellow";
  }

  const alertas = [];
  if (moraMaxima > 30) alertas.push("Mora mayor a 30 días");
  if (limiteConcedido > 0 && exposicionTotal > limiteConcedido) alertas.push("Límite excedido");
  if (deudaVencida > 0) alertas.push("Tiene deuda vencida");
  if (!normalizeText(account.cuit)) alertas.push("Sin CUIT cargado");
  if (bcra?.status === "ok" && Number(bcra.situacion_maxima || 0) > 1) alertas.push(`BCRA situación ${bcra.situacion_maxima}`);
  if (bcra?.status === "ok" && Number(bcra.cheques_recientes || 0) > 0) alertas.push("Cheques rechazados BCRA");
  if (bcra?.status === "invalid_cuit") alertas.push("CUIT inválido para BCRA");

  return {
    score,
    scoreInterno,
    bcraImpact,
    estado,
    color,
    recommendation,
    requiresReview,
    hasBlockingRule,
    appliedRules: applied,
    alertas,
    metrics: {
      moraMaxima,
      deudaVsPromedio,
      limiteOcupado,
      isNewClient,
    },
  };
}

function getCommercialAction(account, evaluation) {
  const score = toNumber(account.score ?? evaluation?.score);
  const montoDisponibleScore = toNumber(account.monto_disponible_score);
  const limiteDisponible = toNumber(account.limite_disponible);
  const moraMaxima = toNumber(account.mora_maxima);
  const mesesSinCompra = toNumber(account.meses_sin_compra);
  const deudaVencida = toNumber(account.deuda_vencida);
  const bcra = account.bcra || null;

  if (evaluation?.hasBlockingRule || account.bloqueado) {
    return {
      accion_sugerida: "Solo contado / regularizar",
      prioridad_comercial: "Bloqueado",
      motivo_accion: "Tiene regla bloqueante o estado crediticio bloqueado.",
      apto_para_vender: false,
    };
  }

  if (moraMaxima > 30 || (deudaVencida > 0 && evaluation?.requiresReview)) {
    return {
      accion_sugerida: "Gestionar cobranza",
      prioridad_comercial: "Cobranza",
      motivo_accion: moraMaxima > 30 ? `Mora máxima ${moraMaxima} días.` : "Tiene deuda vencida y requiere revisión.",
      apto_para_vender: false,
    };
  }

  if (evaluation?.requiresReview) {
    return {
      accion_sugerida: "Solicitar revisión CC",
      prioridad_comercial: "Revisión",
      motivo_accion: "El score requiere revisión de Cuentas Corrientes.",
      apto_para_vender: false,
    };
  }

  if (bcra?.status === "ok" && (toNumber(bcra.situacion_maxima) > 1 || toNumber(bcra.cheques_recientes) > 0 || toNumber(bcra.cheques_impagos) > 0)) {
    return {
      accion_sugerida: "Revisar BCRA",
      prioridad_comercial: "Riesgo externo",
      motivo_accion: "Tiene alerta en BCRA o cheques rechazados.",
      apto_para_vender: false,
    };
  }

  if (montoDisponibleScore > 0 && score >= 700) {
    if (mesesSinCompra >= 3) {
      return {
        accion_sugerida: "Reactivar / agregar a gira",
        prioridad_comercial: "Alta",
        motivo_accion: `Tiene monto disponible por score y lleva ${mesesSinCompra} meses sin compra.`,
        apto_para_vender: true,
      };
    }

    return {
      accion_sugerida: "Vender con cuenta corriente",
      prioridad_comercial: score >= 850 ? "Muy alta" : "Alta",
      motivo_accion: "Score suficiente y monto disponible calculado.",
      apto_para_vender: true,
    };
  }

  if (limiteDisponible > 0 && score >= 700) {
    return {
      accion_sugerida: "Vender dentro de límite Odoo",
      prioridad_comercial: "Media",
      motivo_accion: "Tiene límite Odoo disponible, aunque no habilitó monto por score.",
      apto_para_vender: true,
    };
  }

  return {
    accion_sugerida: "Sin acción comercial",
    prioridad_comercial: "Baja",
    motivo_accion: "No hay monto disponible o no cumple los umbrales de score.",
    apto_para_vender: false,
  };
}

function applyStatusFilter(accounts, status) {
  if (!status || status === "Todos") return accounts;

  return accounts.filter((account) => {
    if (status === "Cartera comercial") return Boolean(account.asesor_id) && String(account.cliente || "").trim().length > 0;
    if (status === "Aptos") return ["Apto cuenta corriente", "Apto con control"].includes(account.estado_crediticio);
    if (status === "Para vender") return Boolean(account.apto_para_vender);
    if (status === "Disponible score") return toNumber(account.monto_disponible_score) > 0;
    if (status === "Revisión") return account.requiere_revision && !account.bloqueado;
    if (status === "Bloqueados") return account.bloqueado || String(account.estado_crediticio || "").includes("No cuenta") || String(account.estado_crediticio || "").includes("Bloqueado");
    if (status === "Excedidos") return account.limite_concedido > 0 && account.limite_disponible < 0;
    if (status === "Sin límite Odoo") return account.limite_concedido <= 0;
    if (status === "Exposición sin límite") return account.exposicion_sin_limite;
    if (status === "Con presupuesto mes") return account.pedidos_venta > 0;
    if (status === "Sin asesor") return !account.asesor_id;
    if (status === "Datos incompletos") return !account.asesor_id || !account.cuit || !String(account.cliente || "").trim();
    if (status === "Mora +30") return account.mora_maxima > 30;
    if (status === "BCRA observados") return account.bcra?.status === "ok" && (toNumber(account.bcra.situacion_maxima) > 1 || toNumber(account.bcra.cheques_recientes) > 0 || toNumber(account.bcra.cheques_impagos) > 0);
    if (status === "Sin BCRA") return !account.bcra;
    return true;
  });
}

async function hasOdooObject(queryOdoo, type, name) {
  try {
    const rows = await queryOdoo(
      `
      SELECT 1
      FROM information_schema.${type === "table" ? "tables" : "columns"}
      WHERE table_schema = 'public'
        ${type === "table" ? "AND table_name = $1" : "AND table_name = $1 AND column_name = $2"}
      LIMIT 1
      `,
      Array.isArray(name) ? name : [name]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function getOdooCapabilities(queryOdoo) {
  const [
    hasCreditLimit,
    hasLimitTable,
    hasChequesTable,
    hasInvoiceDue,
    hasPaymentTermColumn,
    hasPaymentTermTable,
  ] = await Promise.all([
    hasOdooObject(queryOdoo, "column", ["res_partner", "credit_limit"]),
    hasOdooObject(queryOdoo, "table", "limite_credito"),
    hasOdooObject(queryOdoo, "table", "cheques"),
    hasOdooObject(queryOdoo, "column", ["account_move", "invoice_date_due"]),
    hasOdooObject(queryOdoo, "column", ["res_partner", "property_payment_term_id"]),
    hasOdooObject(queryOdoo, "table", "account_payment_term"),
  ]);

  return {
    hasCreditLimit,
    hasLimitTable,
    hasChequesTable,
    hasInvoiceDue,
    hasPaymentTermColumn,
    hasPaymentTermTable,
  };
}

function getPaymentTermSql(capabilities) {
  if (capabilities.hasPaymentTermColumn && capabilities.hasPaymentTermTable) {
    return {
      select: "apt.name AS condicion_pago",
      join: "LEFT JOIN account_payment_term apt ON apt.id = rp.property_payment_term_id",
    };
  }

  return {
    select: "NULL::text AS condicion_pago",
    join: "",
  };
}

function getCurrentMonthBudgetSql() {
  return `
            AND so.state = 'draft'
            AND COALESCE(so.create_date, so.date_order) >= date_trunc('month', CURRENT_DATE)
            AND COALESCE(so.create_date, so.date_order) < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`;
}

function getCreditConcepts() {
  return {
    exposicion: "Exposición crediticia = Cta Cte + Cheques + Presupuestos del mes actual",
    disponibleOdoo: "Disponible según Odoo = Límite concedido Odoo - Exposición crediticia",
    disponibleScore: "Disponible según score = Límite calculado por score - Exposición crediticia",
    pedidosVenta: "Pedidos venta toma solo presupuestos de Odoo en estado Presupuesto/draft del mes actual. No incluye cancelados, bloqueados, pedidos ya facturados ni historial completo.",
  };
}

function buildAccount(row, overrides = {}) {
  const limiteConcedido = roundMoney(overrides.limite_concedido ?? row.limite_concedido);
  const saldo = roundMoney(overrides.saldo ?? row.saldo);
  const cheques = roundMoney(overrides.cheques ?? row.cheques);
  const pedidosConfirmados = roundMoney(overrides.total_pedido_confirmado ?? row.total_pedido_confirmado);
  const pedidosPresupuesto = roundMoney(overrides.total_pedido_presupuesto ?? row.total_pedido_presupuesto);
  const pedidosVenta = roundMoney(pedidosConfirmados + pedidosPresupuesto);
  const ctaCteCheques = roundMoney(saldo + cheques);
  const exposicionTotal = roundMoney(ctaCteCheques + pedidosVenta);
  const limiteDisponible = roundMoney(limiteConcedido - exposicionTotal);
  const porcentajeOcupado = limiteConcedido > 0 ? exposicionTotal / limiteConcedido : null;
  const totalVentas12m = roundMoney(row.total_ventas_12m);
  const compraPromedioMensual = roundMoney(totalVentas12m / 12);
  const promedioUltimasFacturas = roundMoney(row.promedio_ultimas_facturas);
  const cantidadFacturasPromedio = toNumber(row.cantidad_facturas_promedio);

  return {
    cliente_id: Number(row.cliente_id),
    cliente: row.cliente || "Sin nombre",
    cuit: row.cuit || "",
    asesor_id: row.asesor_id ? Number(row.asesor_id) : null,
    asesor: row.asesor || "Sin asesor",
    localidad: row.localidad || "",
    provincia: row.provincia || "",
    condicion_pago: row.condicion_pago || "",
    limite_concedido: limiteConcedido,
    saldo,
    cheques,
    cta_cte_cheques: ctaCteCheques,
    total_pedido_confirmado: pedidosConfirmados,
    total_pedido_presupuesto: pedidosPresupuesto,
    pedidos_venta: pedidosVenta,
    exposicion_total: exposicionTotal,
    limite_disponible: limiteDisponible,
    porcentaje_ocupado: porcentajeOcupado,
    sin_limite_odoo: limiteConcedido <= 0,
    exposicion_sin_limite: limiteConcedido <= 0 && exposicionTotal > 0,
    explicacion_exposicion: getCreditConcepts().exposicion,
    explicacion_disponible_odoo: getCreditConcepts().disponibleOdoo,
    explicacion_disponible_score: getCreditConcepts().disponibleScore,
    criterio_pedidos_venta: getCreditConcepts().pedidosVenta,
    deuda_vencida: roundMoney(row.deuda_vencida),
    deuda_no_vencida: roundMoney(Math.max(0, saldo - roundMoney(row.deuda_vencida))),
    mora_maxima: toNumber(row.mora_maxima),
    facturas_pendientes: toNumber(row.facturas_pendientes),
    total_ventas_12m: totalVentas12m,
    compra_promedio_mensual: compraPromedioMensual,
    promedio_ultimas_facturas: promedioUltimasFacturas,
    cantidad_facturas_promedio: cantidadFacturasPromedio,
    ultima_compra: row.ultima_compra || null,
    meses_sin_compra: row.ultima_compra ? Math.max(0, Math.floor((Date.now() - new Date(row.ultima_compra).getTime()) / (1000 * 60 * 60 * 24 * 30))) : 999,
  };
}

function summarizeBcraData({ identificacion, deudas, historicas, cheques }) {
  const currentPeriods = deudas?.periodos || [];
  const currentPeriod = currentPeriods[0] || null;
  const currentEntities = currentPeriod?.entidades || [];

  const deudaTotalBcra = currentEntities.reduce((sum, item) => sum + toNumber(item.monto) * 1000, 0);
  const situacionMaxima = currentEntities.reduce((max, item) => Math.max(max, toNumber(item.situacion)), 0);
  const diasAtrasoMax = currentEntities.reduce((max, item) => Math.max(max, toNumber(item.diasAtrasoPago)), 0);
  const conRevision = currentEntities.some((item) => item.enRevision);
  const procesoJud = currentEntities.some((item) => item.procesoJud || item.situacionJuridica);

  const historicalPeriods = historicas?.periodos || [];
  let historicoPeorSituacion = 0;
  let historicoDeudaMaxima = 0;
  for (const period of historicalPeriods) {
    for (const entity of period.entidades || []) {
      historicoPeorSituacion = Math.max(historicoPeorSituacion, toNumber(entity.situacion));
      historicoDeudaMaxima = Math.max(historicoDeudaMaxima, toNumber(entity.monto) * 1000);
    }
  }

  const flattenedChecks = [];
  for (const causal of cheques?.causales || []) {
    for (const entity of causal.entidades || []) {
      for (const detail of entity.detalle || []) {
        flattenedChecks.push({
          causal: causal.causal,
          entidad: entity.entidad,
          nroCheque: detail.nroCheque,
          fechaRechazo: detail.fechaRechazo,
          monto: toNumber(detail.monto),
          fechaPago: detail.fechaPago,
          fechaPagoMulta: detail.fechaPagoMulta,
          estadoMulta: detail.estadoMulta,
          enRevision: detail.enRevision,
          procesoJud: detail.procesoJud,
        });
      }
    }
  }

  const now = new Date();
  const recentDays = DEFAULT_POLICY.rules.bcra.recentRejectedCheck.days;
  const recentChecks = flattenedChecks.filter((check) => {
    const days = daysBetween(check.fechaRechazo, now);
    return days !== null && days <= recentDays;
  });
  const unpaidChecks = flattenedChecks.filter((check) => {
    const recent = (() => {
      const days = daysBetween(check.fechaRechazo, now);
      return days === null || days <= recentDays;
    })();
    const fineUnpaid = !check.fechaPagoMulta && ["IMPAGA", "SUSPENDIDO", "SUSPENDIDA"].includes(String(check.estadoMulta || "").toUpperCase());
    return recent && (!check.fechaPago || fineUnpaid);
  });

  const fechaUltimoCheque = flattenedChecks
    .map((check) => check.fechaRechazo)
    .filter(Boolean)
    .sort()
    .pop() || null;

  return {
    status: "ok",
    identificacion: sanitizeIdentification(identificacion || deudas?.identificacion || historicas?.identificacion || cheques?.identificacion),
    denominacion: deudas?.denominacion || historicas?.denominacion || cheques?.denominacion || "",
    periodo: currentPeriod?.periodo || null,
    situacion_maxima: situacionMaxima,
    deuda_total_bcra: roundMoney(deudaTotalBcra),
    entidades_count: currentEntities.length,
    dias_atraso_max: diasAtrasoMax,
    con_revision: conRevision,
    proceso_jud: procesoJud,
    historico_peor_situacion: historicoPeorSituacion,
    historico_deuda_maxima: roundMoney(historicoDeudaMaxima),
    historico_periodos: historicalPeriods.length,
    cheques_total: flattenedChecks.length,
    cheques_recientes: recentChecks.length,
    cheques_impagos: unpaidChecks.length,
    monto_cheques_rechazados: roundMoney(flattenedChecks.reduce((sum, check) => sum + toNumber(check.monto), 0)),
    fecha_ultimo_cheque: fechaUltimoCheque,
    fuente: "BCRA Central de Deudores",
    consulted_at: new Date().toISOString(),
  };
}

async function callBcraEndpoint(path) {
  const baseUrl = process.env.BCRA_API_URL || "https://api.bcra.gob.ar/CentralDeDeudores/v1.0";
  const response = await axios.get(`${baseUrl}${path}`, {
    timeout: Number(process.env.BCRA_TIMEOUT_MS || 18000),
    validateStatus: (status) => status < 500,
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) return null;
  if (response.status >= 400) {
    const messages = response.data?.errorMessages || ["Error consultando BCRA"];
    const error = new Error(messages.join(" | "));
    error.status = response.status;
    throw error;
  }

  return response.data?.results || null;
}

async function fetchBcraReport(identificacion) {
  const clean = sanitizeIdentification(identificacion);
  if (clean.length !== 11) {
    return {
      summary: {
        status: "invalid_cuit",
        identificacion: clean,
        consulted_at: new Date().toISOString(),
      },
      deudas: null,
      historicas: null,
      cheques: null,
    };
  }

  const [deudas, historicas, cheques] = await Promise.all([
    callBcraEndpoint(`/Deudas/${clean}`),
    callBcraEndpoint(`/Deudas/Historicas/${clean}`),
    callBcraEndpoint(`/Deudas/ChequesRechazados/${clean}`),
  ]);

  if (!deudas && !historicas && !cheques) {
    return {
      summary: {
        status: "no_data",
        identificacion: clean,
        consulted_at: new Date().toISOString(),
      },
      deudas,
      historicas,
      cheques,
    };
  }

  return {
    summary: summarizeBcraData({ identificacion: clean, deudas, historicas, cheques }),
    deudas,
    historicas,
    cheques,
  };
}

function saveBcraConsultation(db, { clienteId, identificacion, report, error = null }) {
  const summary = report?.summary || {
    status: error ? "error" : "no_data",
    identificacion: sanitizeIdentification(identificacion),
    consulted_at: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO bcra_consultas (
      cliente_id, identificacion, status, summary, deudas_payload, historicas_payload, cheques_payload, error_message, source, consulted_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    clienteId || null,
    sanitizeIdentification(identificacion),
    summary.status || "ok",
    JSON.stringify(summary),
    JSON.stringify(report?.deudas || null),
    JSON.stringify(report?.historicas || null),
    JSON.stringify(report?.cheques || null),
    error ? error.message : null,
    "BCRA Central de Deudores"
  );

  return summary;
}

function getLatestBcraForAccounts(db, accounts) {
  if (!accounts.length) return new Map();
  const ids = accounts.map((account) => Number(account.cliente_id)).filter(Boolean);
  const identifications = accounts.map((account) => sanitizeIdentification(account.cuit)).filter((item) => item.length === 11);
  const values = [...ids, ...identifications];
  if (!values.length) return new Map();

  const conditions = [];
  const params = [];
  if (ids.length) {
    conditions.push(`cliente_id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  }
  if (identifications.length) {
    conditions.push(`identificacion IN (${identifications.map(() => "?").join(",")})`);
    params.push(...identifications);
  }

  const rows = db.prepare(`
    SELECT *
    FROM bcra_consultas
    WHERE ${conditions.join(" OR ")}
    ORDER BY datetime(consulted_at) DESC, id DESC
  `).all(...params);

  const byKey = new Map();
  for (const row of rows) {
    const summary = parseJson(row.summary, null);
    if (!summary) continue;
    if (row.cliente_id && !byKey.has(Number(row.cliente_id))) byKey.set(Number(row.cliente_id), summary);
    if (row.identificacion && !byKey.has(row.identificacion)) byKey.set(row.identificacion, summary);
  }
  return byKey;
}

async function enrichWithPowerBiTables({ queryOdoo, accounts, capabilities }) {
  if (!accounts.length) return accounts;

  const ids = accounts.map((account) => account.cliente_id);
  const byId = new Map(accounts.map((account) => [Number(account.cliente_id), account]));

  if (capabilities.hasLimitTable) {
    try {
      const rows = await queryOdoo(
        `
        SELECT
          id,
          limit_credit,
          available_credit
        FROM limite_credito
        WHERE id = ANY($1::int[])
        `,
        [ids]
      );

      for (const row of rows) {
        const current = byId.get(Number(row.id));
        if (!current) continue;
        const rebuilt = buildAccount(current, {
          limite_concedido: row.limit_credit,
        });
        Object.assign(current, rebuilt);
      }
    } catch (error) {
      console.warn("No se pudo usar tabla limite_credito:", error.message);
    }
  }

  if (capabilities.hasChequesTable) {
    try {
      const rows = await queryOdoo(
        `
        SELECT
          cliente::int AS cliente_id,
          SUM(COALESCE(monto, 0)) AS monto
        FROM cheques
        WHERE cliente::int = ANY($1::int[])
          AND (estado IS NULL OR estado NOT ILIKE '%rechaz%')
        GROUP BY cliente::int
        `,
        [ids]
      );

      for (const row of rows) {
        const current = byId.get(Number(row.cliente_id));
        if (!current) continue;
        const rebuilt = buildAccount(current, { cheques: row.monto });
        Object.assign(current, rebuilt);
      }
    } catch (error) {
      console.warn("No se pudo usar tabla cheques por id:", error.message);
    }
  }

  return accounts;
}

module.exports = function registerCreditRoutes(context) {
  const { app, db, queryOdoo, queryOdooCached } = context;
  const capabilityQuery = queryOdooCached || queryOdoo;

  app.get("/api/credit/policy", (req, res) => {
    res.json(getActivePolicy(db));
  });

  app.get("/api/credit/score-config", (req, res) => {
    res.json({ policy: getActivePolicy(db) });
  });

  app.get("/api/credit/score-config/history", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT id, name, description, base_score, is_active, created_at, updated_at
        FROM credit_score_policies
        ORDER BY datetime(updated_at) DESC, id DESC
        LIMIT 30
      `).all();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/credit/score-config", (req, res) => {
    try {
      const policy = saveNewActivePolicy(db, req.body?.policy || req.body || {});
      res.json({ policy });
    } catch (error) {
      console.error("ERROR SCORE CONFIG SAVE:", error);
      res.status(400).json({ error: error.message || "No se pudo guardar la política de score" });
    }
  });

  app.post("/api/credit/score-config/reset", (req, res) => {
    try {
      const policy = saveNewActivePolicy(db, {
        ...DEFAULT_POLICY,
        id: `lh-score-reset-${Date.now()}`,
        name: "Política LH Score v1 - restaurada",
        description: "Restaurada desde valores base del sistema.",
      });
      res.json({ policy });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/credit/score-config/:id/activate", (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare(`SELECT * FROM credit_score_policies WHERE id = ?`).get(id);
      if (!row) return res.status(404).json({ error: "Política no encontrada" });
      const policy = normalizePolicyPayload(parseJson(row.payload, DEFAULT_POLICY));
      db.prepare(`UPDATE credit_score_policies SET is_active = 0 WHERE is_active = 1`).run();
      db.prepare(`UPDATE credit_score_policies SET is_active = 1, updated_at = datetime('now') WHERE id = ?`).run(id);
      res.json({ policy: { ...policy, dbId: id, updatedAt: new Date().toISOString() } });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/credit/accounts", async (req, res) => {
    try {
      const {
        search = "",
        asesorId,
        role,
        odooUserId,
        status = "Todos",
        limit = "300",
        page = "1",
        offset,
        companyId: companyIdQuery,
      } = req.query;

      const companyId = Number(companyIdQuery || process.env.ODOO_COMPANY_ID || 3);
      const capabilities = await getOdooCapabilities(capabilityQuery);
      const policy = getActivePolicy(db);
      const calculatedInvoiceCount = Math.max(1, Math.min(12, Number(policy.rules?.limiteCalculado?.invoiceCount || 3)));
      const params = [companyId];
      const where = ["rp.active = true", "rp.customer_rank > 0"];
      const requestedLimit = Number(limit || 300);
      const requestedPage = Number(page || 1);
      const requestedOffset = offset === undefined ? null : Number(offset);
      const safeLimit = Math.min(1000, Math.max(50, Number.isFinite(requestedLimit) ? requestedLimit : 300));
      const safePage = Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1);
      const safeOffset = Math.max(0, Number.isFinite(requestedOffset) ? requestedOffset : ((safePage - 1) * safeLimit));

      if (role === "vendedor" && odooUserId) {
        params.push(Number(odooUserId));
        where.push(`rp.user_id = $${params.length}`);
      } else if (asesorId) {
        params.push(Number(asesorId));
        where.push(`rp.user_id = $${params.length}`);
      }

      if (search) {
        params.push(`%${search}%`);
        where.push(`(rp.name ILIKE $${params.length} OR rp.vat ILIKE $${params.length})`);
      }

      if (status === "Cartera comercial") {
        where.push("rp.user_id IS NOT NULL");
        where.push("rp.name IS NOT NULL");
        where.push("length(trim(rp.name)) > 0");
      }

      const dueExpr = capabilities.hasInvoiceDue
        ? "COALESCE(am.invoice_date_due, am.invoice_date)"
        : "am.invoice_date";
      const creditLimitExpr = capabilities.hasCreditLimit ? "COALESCE(rp.credit_limit, 0)" : "0";
      const paymentTermSql = getPaymentTermSql(capabilities);

      const totalRows = await queryOdoo(
        `
        SELECT COUNT(*)::int AS total
        FROM res_partner rp
        WHERE $1::int IS NOT NULL
          AND ${where.join(" AND ")}
        `,
        params
      );
      const totalBase = Number(totalRows?.[0]?.total || 0);

      const rows = await queryOdoo(
        `
        WITH invoice_debt AS (
          SELECT
            am.partner_id AS cliente_id,
            SUM(COALESCE(am.amount_residual, 0)) AS saldo,
            SUM(CASE WHEN ${dueExpr} < CURRENT_DATE THEN COALESCE(am.amount_residual, 0) ELSE 0 END) AS deuda_vencida,
            MAX(CASE WHEN ${dueExpr} < CURRENT_DATE THEN (CURRENT_DATE - ${dueExpr}) ELSE 0 END) AS mora_maxima,
            COUNT(*) FILTER (WHERE COALESCE(am.amount_residual, 0) > 0) AS facturas_pendientes
          FROM account_move am
          WHERE am.company_id = $1
            AND am.move_type = 'out_invoice'
            AND am.state = 'posted'
            AND COALESCE(am.amount_residual, 0) > 0
          GROUP BY am.partner_id
        ),
        sales_12m AS (
          SELECT
            am.partner_id AS cliente_id,
            SUM(COALESCE(am.amount_total, 0)) AS total_ventas_12m,
            MAX(am.invoice_date) AS ultima_compra
          FROM account_move am
          WHERE am.company_id = $1
            AND am.move_type = 'out_invoice'
            AND am.state = 'posted'
            AND am.invoice_date >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY am.partner_id
        ),
        last_invoices AS (
          SELECT
            cliente_id,
            AVG(amount_total) AS promedio_ultimas_facturas,
            COUNT(*) AS cantidad_facturas_promedio
          FROM (
            SELECT
              am.partner_id AS cliente_id,
              COALESCE(am.amount_total, 0) AS amount_total,
              ROW_NUMBER() OVER (PARTITION BY am.partner_id ORDER BY am.invoice_date DESC NULLS LAST, am.id DESC) AS rn
            FROM account_move am
            WHERE am.company_id = $1
              AND am.move_type = 'out_invoice'
              AND am.state = 'posted'
          ) x
          WHERE rn <= ${calculatedInvoiceCount}
          GROUP BY cliente_id
        ),
        sales_orders AS (
          SELECT
            so.partner_id AS cliente_id,
            0::numeric AS total_pedido_confirmado,
            SUM(COALESCE(so.amount_total, 0)) AS total_pedido_presupuesto
          FROM sale_order so
          WHERE so.company_id = $1
            ${getCurrentMonthBudgetSql()}
          GROUP BY so.partner_id
        )
        SELECT
          rp.id AS cliente_id,
          rp.name AS cliente,
          rp.vat AS cuit,
          rp.city AS localidad,
          rcs.name AS provincia,
          rp.user_id AS asesor_id,
          asesor_partner.name AS asesor,
          ${paymentTermSql.select},
          ${creditLimitExpr} AS limite_concedido,
          COALESCE(inv.saldo, 0) AS saldo,
          0 AS cheques,
          COALESCE(inv.deuda_vencida, 0) AS deuda_vencida,
          COALESCE(inv.mora_maxima, 0) AS mora_maxima,
          COALESCE(inv.facturas_pendientes, 0) AS facturas_pendientes,
          COALESCE(so.total_pedido_confirmado, 0) AS total_pedido_confirmado,
          COALESCE(so.total_pedido_presupuesto, 0) AS total_pedido_presupuesto,
          COALESCE(s12.total_ventas_12m, 0) AS total_ventas_12m,
          s12.ultima_compra,
          COALESCE(li.promedio_ultimas_facturas, 0) AS promedio_ultimas_facturas,
          COALESCE(li.cantidad_facturas_promedio, 0) AS cantidad_facturas_promedio
        FROM res_partner rp
        LEFT JOIN res_users ru ON ru.id = rp.user_id
        LEFT JOIN res_partner asesor_partner ON asesor_partner.id = ru.partner_id
        LEFT JOIN res_country_state rcs ON rcs.id = rp.state_id
        ${paymentTermSql.join}
        LEFT JOIN invoice_debt inv ON inv.cliente_id = rp.id
        LEFT JOIN sales_orders so ON so.cliente_id = rp.id
        LEFT JOIN sales_12m s12 ON s12.cliente_id = rp.id
        LEFT JOIN last_invoices li ON li.cliente_id = rp.id
        WHERE ${where.join(" AND ")}
        ORDER BY rp.name
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
        `,
        params
      );

      let accounts = rows.map((row) => buildAccount(row));
      accounts = await enrichWithPowerBiTables({ queryOdoo, accounts, capabilities });
      const bcraMap = getLatestBcraForAccounts(db, accounts);

      accounts = accounts.map((account) => {
        const bcra = bcraMap.get(Number(account.cliente_id)) || bcraMap.get(sanitizeIdentification(account.cuit)) || null;
        const accountWithBcra = { ...account, bcra };
        const evaluation = evaluateCredit(accountWithBcra, policy);
        const calculatedLimit = calculateScoreLimit(accountWithBcra, evaluation, policy);
        const enrichedAccount = {
          ...accountWithBcra,
          ...calculatedLimit,
          score: evaluation.score,
          score_interno: evaluation.scoreInterno,
          bcra_impacto: evaluation.bcraImpact?.points || 0,
          estado_crediticio: evaluation.estado,
          score_color: evaluation.color,
          recomendacion: evaluation.recommendation,
          requiere_revision: evaluation.requiresReview,
          bloqueado: evaluation.hasBlockingRule,
          alertas: evaluation.alertas,
        };
        return {
          ...enrichedAccount,
          ...getCommercialAction(enrichedAccount, evaluation),
        };
      });

      const filtered = applyStatusFilter(accounts, status);

      const kpis = filtered.reduce(
        (acc, account) => {
          acc.clientes += 1;
          acc.limite_concedido += account.limite_concedido;
          acc.saldo += account.saldo;
          acc.cheques += account.cheques;
          acc.pedidos_venta += account.pedidos_venta;
          acc.exposicion_total += account.exposicion_total;
          acc.limite_disponible += account.limite_disponible;
          acc.limite_calculado += account.limite_calculado || 0;
          acc.disponible_calculado += account.disponible_calculado || 0;
          acc.monto_disponible_score += account.monto_disponible_score || 0;
          if (account.limite_disponible < 0) acc.excedidos += 1;
          if (account.mora_maxima > 30) acc.mora30 += 1;
          if (["Apto cuenta corriente", "Apto con control"].includes(account.estado_crediticio)) acc.aptos += 1;
          if (account.requiere_revision) acc.revision += 1;
          if (account.bcra) acc.bcra_consultados += 1;
          if (account.bcra?.status === "ok" && (Number(account.bcra.situacion_maxima || 0) > 1 || Number(account.bcra.cheques_recientes || 0) > 0)) acc.bcra_observados += 1;
          return acc;
        },
        {
          clientes: 0,
          limite_concedido: 0,
          saldo: 0,
          cheques: 0,
          pedidos_venta: 0,
          exposicion_total: 0,
          limite_disponible: 0,
          limite_calculado: 0,
          disponible_calculado: 0,
          monto_disponible_score: 0,
          excedidos: 0,
          mora30: 0,
          aptos: 0,
          revision: 0,
          bcra_consultados: 0,
          bcra_observados: 0,
        }
      );

      res.json({
        data: filtered,
        kpis,
        policy: policy.name,
        conceptos: getCreditConcepts(),
        pagination: {
          page: safePage,
          limit: safeLimit,
          offset: safeOffset,
          count: filtered.length,
          total_base: totalBase,
          has_more: safeOffset + safeLimit < totalBase,
          next_page: safeOffset + safeLimit < totalBase ? safePage + 1 : null,
        },
      });
    } catch (error) {
      console.error("ERROR CREDIT ACCOUNTS:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/credit/accounts/:clienteId", async (req, res) => {
    try {
      const clienteId = Number(req.params.clienteId);
      const companyId = Number(req.query.companyId || process.env.ODOO_COMPANY_ID || 3);
      const capabilities = await getOdooCapabilities(capabilityQuery);
      const policy = getActivePolicy(db);
      const calculatedInvoiceCount = Math.max(1, Math.min(12, Number(policy.rules?.limiteCalculado?.invoiceCount || 3)));
      const dueExpr = capabilities.hasInvoiceDue
        ? "COALESCE(am.invoice_date_due, am.invoice_date)"
        : "am.invoice_date";
      const creditLimitExpr = capabilities.hasCreditLimit ? "COALESCE(rp.credit_limit, 0)" : "0";
      const paymentTermSql = getPaymentTermSql(capabilities);

      const rows = await queryOdoo(
        `
        WITH invoice_debt AS (
          SELECT
            am.partner_id AS cliente_id,
            SUM(COALESCE(am.amount_residual, 0)) AS saldo,
            SUM(CASE WHEN ${dueExpr} < CURRENT_DATE THEN COALESCE(am.amount_residual, 0) ELSE 0 END) AS deuda_vencida,
            MAX(CASE WHEN ${dueExpr} < CURRENT_DATE THEN (CURRENT_DATE - ${dueExpr}) ELSE 0 END) AS mora_maxima,
            COUNT(*) FILTER (WHERE COALESCE(am.amount_residual, 0) > 0) AS facturas_pendientes
          FROM account_move am
          WHERE am.company_id = $1
            AND am.move_type = 'out_invoice'
            AND am.state = 'posted'
            AND COALESCE(am.amount_residual, 0) > 0
            AND am.partner_id = $2
          GROUP BY am.partner_id
        ),
        sales_12m AS (
          SELECT
            am.partner_id AS cliente_id,
            SUM(COALESCE(am.amount_total, 0)) AS total_ventas_12m,
            MAX(am.invoice_date) AS ultima_compra
          FROM account_move am
          WHERE am.company_id = $1
            AND am.move_type = 'out_invoice'
            AND am.state = 'posted'
            AND am.invoice_date >= CURRENT_DATE - INTERVAL '12 months'
            AND am.partner_id = $2
          GROUP BY am.partner_id
        ),
        last_invoices AS (
          SELECT
            cliente_id,
            AVG(amount_total) AS promedio_ultimas_facturas,
            COUNT(*) AS cantidad_facturas_promedio
          FROM (
            SELECT
              am.partner_id AS cliente_id,
              COALESCE(am.amount_total, 0) AS amount_total,
              ROW_NUMBER() OVER (PARTITION BY am.partner_id ORDER BY am.invoice_date DESC NULLS LAST, am.id DESC) AS rn
            FROM account_move am
            WHERE am.company_id = $1
              AND am.move_type = 'out_invoice'
              AND am.state = 'posted'
          ) x
          WHERE rn <= ${calculatedInvoiceCount}
          GROUP BY cliente_id
        ),
        sales_orders AS (
          SELECT
            so.partner_id AS cliente_id,
            0::numeric AS total_pedido_confirmado,
            SUM(COALESCE(so.amount_total, 0)) AS total_pedido_presupuesto
          FROM sale_order so
          WHERE so.company_id = $1
            AND so.partner_id = $2
            ${getCurrentMonthBudgetSql()}
          GROUP BY so.partner_id
        )
        SELECT
          rp.id AS cliente_id,
          rp.name AS cliente,
          rp.vat AS cuit,
          rp.city AS localidad,
          rcs.name AS provincia,
          rp.user_id AS asesor_id,
          asesor_partner.name AS asesor,
          ${paymentTermSql.select},
          ${creditLimitExpr} AS limite_concedido,
          COALESCE(inv.saldo, 0) AS saldo,
          0 AS cheques,
          COALESCE(inv.deuda_vencida, 0) AS deuda_vencida,
          COALESCE(inv.mora_maxima, 0) AS mora_maxima,
          COALESCE(inv.facturas_pendientes, 0) AS facturas_pendientes,
          COALESCE(so.total_pedido_confirmado, 0) AS total_pedido_confirmado,
          COALESCE(so.total_pedido_presupuesto, 0) AS total_pedido_presupuesto,
          COALESCE(s12.total_ventas_12m, 0) AS total_ventas_12m,
          s12.ultima_compra,
          COALESCE(li.promedio_ultimas_facturas, 0) AS promedio_ultimas_facturas,
          COALESCE(li.cantidad_facturas_promedio, 0) AS cantidad_facturas_promedio
        FROM res_partner rp
        LEFT JOIN res_users ru ON ru.id = rp.user_id
        LEFT JOIN res_partner asesor_partner ON asesor_partner.id = ru.partner_id
        LEFT JOIN res_country_state rcs ON rcs.id = rp.state_id
        ${paymentTermSql.join}
        LEFT JOIN invoice_debt inv ON inv.cliente_id = rp.id
        LEFT JOIN sales_orders so ON so.cliente_id = rp.id
        LEFT JOIN sales_12m s12 ON s12.cliente_id = rp.id
        LEFT JOIN last_invoices li ON li.cliente_id = rp.id
        WHERE rp.id = $2
        LIMIT 1
        `,
        [companyId, clienteId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }

      let account = buildAccount(rows[0]);
      const enriched = await enrichWithPowerBiTables({ queryOdoo, accounts: [account], capabilities });
      account = enriched[0];
      const bcraMap = getLatestBcraForAccounts(db, [account]);
      account.bcra = bcraMap.get(Number(account.cliente_id)) || bcraMap.get(sanitizeIdentification(account.cuit)) || null;
      const evaluation = evaluateCredit(account, policy);
      const calculatedLimit = calculateScoreLimit(account, evaluation, policy);
      account = { ...account, ...calculatedLimit };
      const commercialAction = getCommercialAction(
        {
          ...account,
          score: evaluation.score,
          score_interno: evaluation.scoreInterno,
          bcra_impacto: evaluation.bcraImpact?.points || 0,
          estado_crediticio: evaluation.estado,
          score_color: evaluation.color,
          recomendacion: evaluation.recommendation,
          requiere_revision: evaluation.requiresReview,
          bloqueado: evaluation.hasBlockingRule,
          alertas: evaluation.alertas,
        },
        evaluation
      );

      const facturas = await queryOdoo(
        `
        SELECT
          am.id AS factura_id,
          am.name AS factura,
          am.invoice_date AS fecha_factura,
          ${dueExpr} AS fecha_vencimiento,
          COALESCE(am.amount_total, 0) AS importe_original,
          COALESCE(am.amount_residual, 0) AS saldo_pendiente,
          CASE WHEN ${dueExpr} < CURRENT_DATE THEN (CURRENT_DATE - ${dueExpr}) ELSE 0 END AS dias_vencidos,
          am.payment_state,
          am.state
        FROM account_move am
        WHERE am.company_id = $1
          AND am.partner_id = $2
          AND am.move_type = 'out_invoice'
          AND am.state = 'posted'
          AND COALESCE(am.amount_residual, 0) > 0
        ORDER BY ${dueExpr} ASC NULLS LAST
        LIMIT 80
        `,
        [companyId, clienteId]
      );

      const pedidos = await queryOdoo(
        `
        SELECT
          so.id AS pedido_id,
          so.name AS pedido,
          so.date_order AS fecha,
          so.state,
          COALESCE(so.amount_total, 0) AS monto
        FROM sale_order so
        WHERE so.company_id = $1
          AND so.partner_id = $2
          ${getCurrentMonthBudgetSql()}
        ORDER BY so.date_order DESC
        LIMIT 50
        `,
        [companyId, clienteId]
      );

      let cheques = [];
      if (capabilities.hasChequesTable) {
        try {
          cheques = await queryOdoo(
            `
            SELECT *
            FROM cheques
            WHERE cliente::int = $1
            ORDER BY fecha_pago DESC NULLS LAST
            LIMIT 50
            `,
            [clienteId]
          );
        } catch (error) {
          console.warn("No se pudo consultar detalle de cheques:", error.message);
        }
      }

      db.prepare(`
        INSERT INTO credit_score_evaluations (
          cliente_id,
          cliente,
          score,
          status,
          recommendation,
          payload,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        account.cliente_id,
        account.cliente,
        evaluation.score,
        evaluation.estado,
        evaluation.recommendation,
        JSON.stringify({ account, evaluation })
      );

      res.json({
        account: {
          ...account,
          score: evaluation.score,
          score_interno: evaluation.scoreInterno,
          bcra_impacto: evaluation.bcraImpact?.points || 0,
          estado_crediticio: evaluation.estado,
          score_color: evaluation.color,
          recomendacion: evaluation.recommendation,
          requiere_revision: evaluation.requiresReview,
          bloqueado: evaluation.hasBlockingRule,
          alertas: evaluation.alertas,
          ...commercialAction,
        },
        facturas,
        pedidos,
        cheques,
        evaluation,
      });
    } catch (error) {
      console.error("ERROR CREDIT ACCOUNT DETAIL:", error);
      res.status(500).json({ error: error.message });
    }
  });


  app.get("/api/credit/bcra/bulk/history", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT *
        FROM bcra_bulk_runs
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 20
      `).all();
      res.json(rows.map((row) => ({
        ...row,
        filters: parseJson(row.filters_payload, {}),
      })));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });


  app.post("/api/credit/bcra/bulk", async (req, res) => {
    try {
      const {
        search = "",
        asesorId,
        role,
        odooUserId,
        limit = 300,
        force = false,
        clientIds = [],
        executedBy = "Sistema",
      } = req.body || {};

      const policy = getActivePolicy(db);
      const maxCacheDays = Number(policy.rules?.bcra?.maxCacheDays || DEFAULT_POLICY.rules.bcra.maxCacheDays);
      const requestedLimit = Number(limit || 300);
      const safeLimit = Math.min(1000, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 300));
      const requestedDelay = Number(process.env.BCRA_BULK_DELAY_MS || 250);
      const delayMs = Math.max(0, Number.isFinite(requestedDelay) ? requestedDelay : 250);
      const params = [];
      const where = ["rp.active = true", "rp.customer_rank > 0", "rp.vat IS NOT NULL", "trim(rp.vat) <> ''"];
      const numericClientIds = Array.isArray(clientIds)
        ? clientIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0).slice(0, safeLimit)
        : [];

      if (numericClientIds.length) {
        params.push(numericClientIds);
        where.push(`rp.id = ANY($${params.length}::int[])`);
      }

      if (role === "vendedor" && odooUserId) {
        params.push(Number(odooUserId));
        where.push(`rp.user_id = $${params.length}`);
      } else if (asesorId) {
        params.push(Number(asesorId));
        where.push(`rp.user_id = $${params.length}`);
      }

      if (search) {
        params.push(`%${search}%`);
        where.push(`(rp.name ILIKE $${params.length} OR rp.vat ILIKE $${params.length})`);
      }

      const clients = await queryOdoo(
        `
        SELECT rp.id, rp.name, rp.vat
        FROM res_partner rp
        WHERE ${where.join(" AND ")}
        ORDER BY rp.name
        LIMIT ${safeLimit}
        `,
        params
      );

      const result = {
        total: clients.length,
        consulted: 0,
        skipped: 0,
        invalid: 0,
        errors: 0,
        observed: 0,
        details: [],
      };

      const run = db.prepare(`
        INSERT INTO bcra_bulk_runs (
          status, executed_by, filters_payload, total, created_at
        )
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(
        "running",
        String(executedBy || "Sistema"),
        JSON.stringify({ search, asesorId, role, odooUserId, limit: safeLimit, force, clientIds: numericClientIds }),
        result.total
      );
      const runId = run.lastInsertRowid;

      for (const cliente of clients) {
        const identificacion = sanitizeIdentification(cliente.vat);
        if (identificacion.length !== 11) {
          result.invalid += 1;
          const summary = saveBcraConsultation(db, {
            clienteId: Number(cliente.id),
            identificacion,
            report: {
              summary: {
                status: "invalid_cuit",
                identificacion,
                cliente: cliente.name,
                consulted_at: new Date().toISOString(),
              },
            },
          });
          result.details.push({ cliente_id: cliente.id, cliente: cliente.name, status: summary.status, message: "CUIT inválido" });
          continue;
        }

        const latest = db.prepare(`
          SELECT status, summary, consulted_at
          FROM bcra_consultas
          WHERE cliente_id = ? OR identificacion = ?
          ORDER BY datetime(consulted_at) DESC, id DESC
          LIMIT 1
        `).get(Number(cliente.id), identificacion);

        const ageDays = latest?.consulted_at ? daysBetween(latest.consulted_at) : null;
        if (!force && latest && ageDays !== null && ageDays <= maxCacheDays) {
          result.skipped += 1;
          result.details.push({ cliente_id: cliente.id, cliente: cliente.name, status: "skipped", message: `Consulta vigente hace ${ageDays} días` });
          continue;
        }

        try {
          const report = await fetchBcraReport(identificacion);
          const summary = saveBcraConsultation(db, { clienteId: Number(cliente.id), identificacion, report });
          result.consulted += 1;
          if (summary.status === "ok" && (Number(summary.situacion_maxima || 0) > 1 || Number(summary.cheques_recientes || 0) > 0 || Number(summary.cheques_impagos || 0) > 0)) {
            result.observed += 1;
          }
          result.details.push({ cliente_id: cliente.id, cliente: cliente.name, status: summary.status, situacion: summary.situacion_maxima || null, cheques_recientes: summary.cheques_recientes || 0 });
        } catch (error) {
          result.errors += 1;
          const summary = saveBcraConsultation(db, {
            clienteId: Number(cliente.id),
            identificacion,
            report: {
              summary: {
                status: "error",
                identificacion,
                cliente: cliente.name,
                consulted_at: new Date().toISOString(),
              },
            },
            error,
          });
          result.details.push({ cliente_id: cliente.id, cliente: cliente.name, status: summary.status, message: error.message });
        }

        if (delayMs > 0) await sleep(delayMs);
      }

      db.prepare(`
        UPDATE bcra_bulk_runs
        SET status = ?, consulted = ?, skipped = ?, invalid = ?, errors = ?, observed = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(
        result.errors > 0 ? "finished_with_errors" : "finished",
        result.consulted,
        result.skipped,
        result.invalid,
        result.errors,
        result.observed,
        runId
      );

      res.json({ ...result, run_id: runId });
    } catch (error) {
      console.error("ERROR BCRA BULK:", error);
      res.status(500).json({ error: error.message });
    }
  });


  app.post("/api/credit/accounts/:clienteId/bcra", async (req, res) => {
    try {
      const clienteId = Number(req.params.clienteId);
      const rows = await queryOdoo(
        `
        SELECT id, name, vat
        FROM res_partner
        WHERE id = $1
        LIMIT 1
        `,
        [clienteId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "Cliente no encontrado en Odoo" });
      }

      const cliente = rows[0];
      const identificacion = sanitizeIdentification(req.body?.cuit || cliente.vat);

      if (identificacion.length !== 11) {
        const summary = saveBcraConsultation(db, {
          clienteId,
          identificacion,
          report: {
            summary: {
              status: "invalid_cuit",
              identificacion,
              cliente: cliente.name,
              consulted_at: new Date().toISOString(),
            },
          },
        });
        return res.status(400).json({ error: "CUIT/CUIL/CDI inválido para consultar BCRA. Debe tener 11 dígitos.", summary });
      }

      try {
        const report = await fetchBcraReport(identificacion);
        const summary = saveBcraConsultation(db, { clienteId, identificacion, report });
        res.json({ summary, deudas: report.deudas, historicas: report.historicas, cheques: report.cheques });
      } catch (error) {
        const summary = saveBcraConsultation(db, {
          clienteId,
          identificacion,
          report: {
            summary: {
              status: "error",
              identificacion,
              cliente: cliente.name,
              consulted_at: new Date().toISOString(),
            },
          },
          error,
        });
        res.status(error.status || 502).json({ error: error.message || "No se pudo consultar BCRA", summary });
      }
    } catch (error) {
      console.error("ERROR BCRA CONSULT:", error);
      res.status(500).json({ error: error.message });
    }
  });
};
