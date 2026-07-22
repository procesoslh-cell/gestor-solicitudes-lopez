module.exports = function registerCommissionRoutes(context) {
  const { app, db, createNotification } = context;

  const VIEW_ROLES = new Set(["supervisor", "jefe", "gerente", "rrhh", "admin"]);
  const MANAGE_ROLES = new Set(["supervisor", "jefe", "admin"]);
  const CONFIG_ROLES = new Set(["jefe", "supervisor", "admin"]);
  const HR_ROLES = new Set(["rrhh", "admin"]);

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

  function roleFrom(req) {
    return String(req.body?.userRole || req.query?.userRole || req.headers["x-user-role"] || "").toLowerCase();
  }

  function userFrom(req) {
    return String(req.body?.user || req.query?.user || req.headers["x-user-name"] || "Sistema");
  }

  function requireRole(req, res, allowed) {
    const role = roleFrom(req);
    if (!allowed.has(role)) {
      res.status(403).json({ error: "No tenés permisos para realizar esta acción." });
      return null;
    }
    return role;
  }

  function normalizeUnit(value) {
    const unit = String(value || "ciclismo").toLowerCase();
    return UNIT_META[unit] ? unit : "ciclismo";
  }

  function normalizePeriod(value) {
    const raw = String(value || "").slice(0, 7);
    return /^\d{4}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 7);
  }

  function toNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function roundMoney(value) {
    return Math.round(toNumber(value) * 100) / 100;
  }

  function parseJson(value, fallback = {}) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeRules(rules, unit) {
    const meta = UNIT_META[normalizeUnit(unit)];
    const clean = {
      sales: {},
      collections: Array.isArray(rules?.collections) ? rules.collections : [],
      reach: {},
      clients: Array.isArray(rules?.clients) ? rules.clients : [],
      multipliers: Array.isArray(rules?.multipliers) ? rules.multipliers : [],
      penaltyDefaultRate: toNumber(rules?.penaltyDefaultRate),
      notes: String(rules?.notes || ""),
    };

    meta.categories.forEach(({ key }) => {
      clean.sales[key] = {
        mostrador: toNumber(rules?.sales?.[key]?.mostrador),
        distribuidor: toNumber(rules?.sales?.[key]?.distribuidor),
      };
      clean.reach[key] = (Array.isArray(rules?.reach?.[key]) ? rules.reach[key] : [])
        .map((row) => ({ minPct: toNumber(row.minPct), rate: toNumber(row.rate) }))
        .filter((row) => row.minPct >= 0)
        .sort((a, b) => a.minPct - b.minPct);
    });

    clean.collections = clean.collections
      .map((row) => ({ method: String(row.method || "").trim(), rate: toNumber(row.rate) }))
      .filter((row) => row.method);
    clean.clients = clean.clients
      .map((row) => ({ minClients: Math.max(0, Math.trunc(toNumber(row.minClients))), amount: roundMoney(row.amount) }))
      .sort((a, b) => a.minClients - b.minClients);
    clean.multipliers = clean.multipliers
      .map((row) => ({
        name: String(row.name || "Multiplicador").trim(),
        metric: row.metric === "clients" ? "clients" : "objective",
        minPct: toNumber(row.minPct),
        rate: toNumber(row.rate),
        applyTo: ["sales", "reach", "collections", "subtotal"].includes(row.applyTo) ? row.applyTo : "subtotal",
      }))
      .filter((row) => row.minPct >= 0)
      .sort((a, b) => a.minPct - b.minPct);

    return clean;
  }

  function schemeRow(row) {
    if (!row) return null;
    return { ...row, rules: parseJson(row.rules_json, {}) };
  }

  function liquidationRow(row) {
    if (!row) return null;
    return {
      ...row,
      metrics: parseJson(row.metrics_json, {}),
      calculation: parseJson(row.calculation_json, {}),
      sourceSnapshot: parseJson(row.source_snapshot_json, null),
    };
  }

  function addHistory(liquidationId, action, fromStatus, toStatus, comments, userName, userRole) {
    db.prepare(`
      INSERT INTO commission_history (
        liquidation_id, action, from_status, to_status, comments,
        user_name, user_role, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(liquidationId, action, fromStatus || null, toStatus || null, comments || null, userName, userRole);
  }

  function getAdjustments(liquidationId) {
    return db.prepare(`
      SELECT * FROM commission_adjustments
      WHERE liquidation_id = ?
      ORDER BY id
    `).all(liquidationId);
  }

  function updateFinalTotal(liquidationId, user) {
    const base = db.prepare(`SELECT base_commission FROM commission_liquidations WHERE id = ?`).get(liquidationId);
    const adjustments = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM commission_adjustments WHERE liquidation_id = ?
    `).get(liquidationId);
    const adjustmentTotal = roundMoney(adjustments?.total);
    const finalTotal = roundMoney(toNumber(base?.base_commission) + adjustmentTotal);
    db.prepare(`
      UPDATE commission_liquidations
      SET adjustments_total = ?, final_total = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(adjustmentTotal, finalTotal, user || "Sistema", liquidationId);
    return { adjustmentTotal, finalTotal };
  }

  function getCollectionsSnapshot(period, advisorId, advisorName) {
    const rows = db.prepare(`
      SELECT c.*, GROUP_CONCAT(ci.invoice_number, ' | ') AS invoices
      FROM collections c
      LEFT JOIN collection_items ci ON ci.collection_id = c.id
      WHERE c.status = 'Validada'
        AND substr(COALESCE(c.validated_at, c.created_at), 1, 7) = ?
        AND (
          (? > 0 AND c.asesor_id = ?)
          OR lower(trim(COALESCE(c.asesor, ''))) = lower(trim(?))
        )
      GROUP BY c.id
      ORDER BY COALESCE(c.validated_at, c.created_at), c.id
    `).all(period, advisorId || 0, advisorId || 0, advisorName || "");

    const byMethod = {};
    rows.forEach((row) => {
      const method = String(row.payment_method || "Sin definir").trim() || "Sin definir";
      if (!byMethod[method]) byMethod[method] = { method, total: 0, count: 0, rows: [] };
      byMethod[method].total = roundMoney(byMethod[method].total + toNumber(row.total));
      byMethod[method].count += 1;
      byMethod[method].rows.push(row);
    });

    return {
      total: roundMoney(rows.reduce((sum, row) => sum + toNumber(row.total), 0)),
      rows,
      byMethod: Object.values(byMethod),
    };
  }

  function selectTier(tiers, metricValue, field = "minPct") {
    return (Array.isArray(tiers) ? tiers : [])
      .filter((tier) => toNumber(metricValue) >= toNumber(tier[field]))
      .sort((a, b) => toNumber(b[field]) - toNumber(a[field]))[0] || null;
  }

  function calculateAdvisor(row, rules, unit, collectionSnapshot) {
    const items = [];
    const meta = UNIT_META[unit];

    meta.categories.forEach(({ key, label }) => {
      const category = row.categories?.[key] || {};
      const channelRules = rules.sales?.[key] || {};
      [
        ["mostrador", "Mostrador", category.store],
        ["distribuidor", "Distribuidor", category.distributor],
      ].forEach(([channel, channelLabel, base]) => {
        const rate = toNumber(channelRules[channel]);
        const rawAmount = toNumber(base) * rate / 100;
        const amount = roundMoney(rawAmount);
        items.push({
          itemType: "Venta",
          category: key,
          channel,
          concept: `${label} · ${channelLabel}`,
          baseAmount: roundMoney(base),
          rate,
          quantity: 0,
          amount,
          rawAmount,
          sourceRef: "Objetivos Comerciales",
          sourcePayload: { sale: roundMoney(base), category: key, channel },
        });
      });

      const reachTier = selectTier(rules.reach?.[key], category.fulfillment);
      if (reachTier) {
        const rawAmount = toNumber(category.sale) * toNumber(reachTier.rate) / 100;
        const amount = roundMoney(rawAmount);
        items.push({
          itemType: "Alcance",
          category: key,
          channel: null,
          concept: `${label} · alcance ${roundMoney(category.fulfillment)}%`,
          baseAmount: roundMoney(category.sale),
          rate: toNumber(reachTier.rate),
          quantity: roundMoney(category.fulfillment),
          amount,
          rawAmount,
          sourceRef: `Escalón ${reachTier.minPct}%`,
          sourcePayload: { tier: reachTier, category },
        });
      }
    });

    (collectionSnapshot.byMethod || []).forEach((group) => {
      const rule = (rules.collections || []).find(
        (item) => String(item.method || "").trim().toLowerCase() === String(group.method || "").trim().toLowerCase()
      );
      if (!rule) return;
      const rawAmount = toNumber(group.total) * toNumber(rule.rate) / 100;
      const amount = roundMoney(rawAmount);
      items.push({
        itemType: "Cobranza",
        category: null,
        channel: group.method,
        concept: `Cobranzas · ${group.method}`,
        baseAmount: roundMoney(group.total),
        rate: toNumber(rule.rate),
        quantity: group.count,
        amount,
        rawAmount,
        sourceRef: `${group.count} cobranzas validadas`,
        sourcePayload: group.rows.map((item) => ({ id: item.id, receipt: item.receipt_number, total: item.total })),
      });
    });

    const clientTier = selectTier(rules.clients, row.clients, "minClients");
    if (clientTier) {
      items.push({
        itemType: "Clientes",
        category: null,
        channel: null,
        concept: `Premio por ${row.clients} clientes vendidos`,
        baseAmount: 0,
        rate: 0,
        quantity: row.clients,
        amount: roundMoney(clientTier.amount),
        rawAmount: toNumber(clientTier.amount),
        sourceRef: `Escalón ${clientTier.minClients} clientes`,
        sourcePayload: { tier: clientTier, clients: row.clients },
      });
    }

    const baseByType = () => ({
      sales: items.filter((item) => item.itemType === "Venta").reduce((sum, item) => sum + toNumber(item.rawAmount ?? item.amount), 0),
      reach: items.filter((item) => item.itemType === "Alcance").reduce((sum, item) => sum + toNumber(item.rawAmount ?? item.amount), 0),
      collections: items.filter((item) => item.itemType === "Cobranza").reduce((sum, item) => sum + toNumber(item.rawAmount ?? item.amount), 0),
      subtotal: items.reduce((sum, item) => sum + toNumber(item.rawAmount ?? item.amount), 0),
    });

    const multiplierGroups = new Map();
    (rules.multipliers || []).forEach((rule) => {
      const key = `${rule.metric}:${rule.applyTo}`;
      if (!multiplierGroups.has(key)) multiplierGroups.set(key, []);
      multiplierGroups.get(key).push(rule);
    });

    multiplierGroups.forEach((group) => {
      const metricRule = group[0];
      const metricValue = metricRule.metric === "clients" ? row.clientsFulfillment : row.fulfillmentTotal;
      const selected = selectTier(group, metricValue);
      if (!selected) return;
      const bases = baseByType();
      const base = bases[selected.applyTo] ?? bases.subtotal;
      const rawAmount = base * toNumber(selected.rate) / 100;
      const amount = roundMoney(rawAmount);
      items.push({
        itemType: "Multiplicador",
        category: null,
        channel: null,
        concept: selected.name || `Multiplicador ${selected.metric}`,
        baseAmount: base,
        rate: toNumber(selected.rate),
        quantity: roundMoney(metricValue),
        amount,
        rawAmount,
        sourceRef: `${selected.metric === "clients" ? "Clientes" : "Objetivo"} ${roundMoney(metricValue)}%`,
        sourcePayload: selected,
      });
    });

    const baseCommission = roundMoney(items.reduce((sum, item) => sum + toNumber(item.rawAmount ?? item.amount), 0));
    return { items, baseCommission };
  }

  async function buildSourceSnapshot(liquidation) {
    if (typeof context.buildCommercialObjectivesAudit !== "function") {
      throw new Error("La auditoría de Objetivos Comerciales todavía no está disponible.");
    }

    let audit = null;
    const completeDetail = [];
    const pageSize = 2000;
    const maxLines = 10000;

    for (let offset = 0; offset < maxLines; offset += pageSize) {
      const page = await context.buildCommercialObjectivesAudit({
        period: liquidation.period,
        unit: liquidation.unit,
        advisorId: liquidation.advisor_id || "",
        advisorName: liquidation.advisor_name,
        limit: pageSize,
        offset,
      });
      if (!audit) audit = page;
      completeDetail.push(...(page.detail || []));
      if ((page.detail || []).length < pageSize) break;
    }

    audit = audit || { detail: [], clients: [], summary: [], totals: {} };
    audit.detail = completeDetail;
    audit.snapshotTruncated = completeDetail.length >= maxLines;

    const collections = getCollectionsSnapshot(
      liquidation.period,
      Number(liquidation.advisor_id || 0),
      liquidation.advisor_name
    );
    return { capturedAt: new Date().toISOString(), audit, collections };
  }

  app.get("/api/commissions/meta", (req, res) => {
    if (!requireRole(req, res, VIEW_ROLES)) return;
    res.json({ units: UNIT_META, statuses: ["Borrador", "Enviada a RRHH", "Devuelta", "Aprobada", "Rechazada"] });
  });

  app.get("/api/commissions/schemes", (req, res) => {
    if (!requireRole(req, res, VIEW_ROLES)) return;
    const unit = req.query.unit ? normalizeUnit(req.query.unit) : null;
    const rows = unit
      ? db.prepare(`SELECT * FROM commission_schemes WHERE unit = ? ORDER BY version DESC, id DESC`).all(unit)
      : db.prepare(`SELECT * FROM commission_schemes ORDER BY unit, version DESC, id DESC`).all();
    res.json(rows.map(schemeRow));
  });

  app.post("/api/commissions/schemes", (req, res) => {
    const role = requireRole(req, res, CONFIG_ROLES);
    if (!role) return;
    try {
      const body = req.body || {};
      const unit = normalizeUnit(body.unit);
      const sourceId = Number(body.sourceSchemeId || 0);
      let source = null;
      if (sourceId) source = db.prepare(`SELECT * FROM commission_schemes WHERE id = ?`).get(sourceId);
      const name = String(body.name || source?.name || `Esquema ${UNIT_META[unit].label}`).trim();
      const maxVersion = db.prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM commission_schemes WHERE unit = ? AND name = ?`).get(unit, name);
      const version = Math.max(Number(source?.version || 0), Number(maxVersion?.version || 0)) + 1;
      const rules = normalizeRules(body.rules || parseJson(source?.rules_json, {}), unit);
      const user = userFrom(req);
      const result = db.prepare(`
        INSERT INTO commission_schemes (
          name, unit, version, valid_from, valid_to, status, description,
          rules_json, created_by, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'Borrador', ?, ?, ?, datetime('now'), ?, datetime('now'))
      `).run(
        name,
        unit,
        version,
        normalizePeriod(body.validFrom || source?.valid_from),
        body.validTo || source?.valid_to || null,
        String(body.description || source?.description || ""),
        JSON.stringify(rules),
        user,
        user
      );
      res.status(201).json(schemeRow(db.prepare(`SELECT * FROM commission_schemes WHERE id = ?`).get(result.lastInsertRowid)));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/commissions/schemes/:id", (req, res) => {
    const role = requireRole(req, res, CONFIG_ROLES);
    if (!role) return;
    try {
      const scheme = db.prepare(`SELECT * FROM commission_schemes WHERE id = ?`).get(req.params.id);
      if (!scheme) return res.status(404).json({ error: "Esquema no encontrado." });
      if (scheme.status !== "Borrador") return res.status(409).json({ error: "Solo se pueden editar esquemas en borrador. Creá una nueva versión." });
      const body = req.body || {};
      const unit = normalizeUnit(body.unit || scheme.unit);
      const rules = normalizeRules(body.rules || parseJson(scheme.rules_json, {}), unit);
      const user = userFrom(req);
      db.prepare(`
        UPDATE commission_schemes
        SET name = ?, unit = ?, valid_from = ?, valid_to = ?, description = ?,
            rules_json = ?, updated_by = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        String(body.name || scheme.name), unit,
        normalizePeriod(body.validFrom || scheme.valid_from), body.validTo || null,
        String(body.description ?? scheme.description ?? ""), JSON.stringify(rules), user, scheme.id
      );
      res.json(schemeRow(db.prepare(`SELECT * FROM commission_schemes WHERE id = ?`).get(scheme.id)));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/commissions/schemes/:id/activate", (req, res) => {
    const role = requireRole(req, res, CONFIG_ROLES);
    if (!role) return;
    const scheme = db.prepare(`SELECT * FROM commission_schemes WHERE id = ?`).get(req.params.id);
    if (!scheme) return res.status(404).json({ error: "Esquema no encontrado." });
    const user = userFrom(req);
    const transaction = db.transaction(() => {
      db.prepare(`UPDATE commission_schemes SET status = 'Inactivo', updated_at = datetime('now') WHERE unit = ? AND status = 'Activo'`).run(scheme.unit);
      db.prepare(`
        UPDATE commission_schemes
        SET status = 'Activo', activated_by = ?, activated_at = datetime('now'), updated_by = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(user, user, scheme.id);
    });
    transaction();
    res.json(schemeRow(db.prepare(`SELECT * FROM commission_schemes WHERE id = ?`).get(scheme.id)));
  });

  app.get("/api/commissions/liquidations", (req, res) => {
    if (!requireRole(req, res, VIEW_ROLES)) return;
    const filters = [];
    const params = [];
    if (req.query.period) { filters.push("period = ?"); params.push(normalizePeriod(req.query.period)); }
    if (req.query.unit) { filters.push("unit = ?"); params.push(normalizeUnit(req.query.unit)); }
    if (req.query.status && req.query.status !== "Todos") { filters.push("status = ?"); params.push(String(req.query.status)); }
    const sql = `SELECT * FROM commission_liquidations ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY period DESC, unit, advisor_name`;
    res.json(db.prepare(sql).all(...params).map(liquidationRow));
  });

  app.get("/api/commissions/liquidations/:id", (req, res) => {
    if (!requireRole(req, res, VIEW_ROLES)) return;
    const liquidation = liquidationRow(db.prepare(`SELECT * FROM commission_liquidations WHERE id = ?`).get(req.params.id));
    if (!liquidation) return res.status(404).json({ error: "Liquidación no encontrada." });
    const items = db.prepare(`SELECT * FROM commission_liquidation_items WHERE liquidation_id = ? ORDER BY id`).all(liquidation.id)
      .map((item) => ({ ...item, source: parseJson(item.source_payload, null) }));
    const adjustments = getAdjustments(liquidation.id);
    const history = db.prepare(`SELECT * FROM commission_history WHERE liquidation_id = ? ORDER BY id DESC`).all(liquidation.id);
    res.json({ ...liquidation, items, adjustments, history });
  });

  app.post("/api/commissions/calculate", async (req, res) => {
    const role = requireRole(req, res, MANAGE_ROLES);
    if (!role) return;
    try {
      if (typeof context.buildCommercialObjectivesSummary !== "function") {
        throw new Error("Objetivos Comerciales no está disponible para calcular comisiones.");
      }
      const body = req.body || {};
      const unit = normalizeUnit(body.unit);
      const period = normalizePeriod(body.period);
      let scheme = body.schemeId ? db.prepare(`SELECT * FROM commission_schemes WHERE id = ?`).get(body.schemeId) : null;
      if (!scheme) {
        scheme = db.prepare(`
          SELECT * FROM commission_schemes
          WHERE unit = ? AND status = 'Activo'
            AND (valid_from IS NULL OR valid_from <= ?)
            AND (valid_to IS NULL OR valid_to = '' OR valid_to >= ?)
          ORDER BY version DESC LIMIT 1
        `).get(unit, period, period);
      }
      if (!scheme) return res.status(409).json({ error: "No existe un esquema activo y vigente para el período seleccionado." });
      if (scheme.status !== "Activo") return res.status(409).json({ error: "El esquema seleccionado debe estar activo." });
      if (scheme.valid_from && scheme.valid_from > period) {
        return res.status(409).json({ error: `El esquema comienza a regir en ${scheme.valid_from}.` });
      }
      if (scheme.valid_to && scheme.valid_to < period) {
        return res.status(409).json({ error: `El esquema finalizó su vigencia en ${scheme.valid_to}.` });
      }

      const rules = normalizeRules(parseJson(scheme.rules_json, {}), unit);
      const summary = await context.buildCommercialObjectivesSummary({ period, unit, companyId: body.companyId });
      const user = userFrom(req);
      const calculated = [];
      const transaction = db.transaction((preparedRows) => {
        for (const prepared of preparedRows) {
          const row = prepared.row;
          const advisorId = Number(row.advisorId || 0);
          let existing = db.prepare(`
            SELECT * FROM commission_liquidations
            WHERE period = ? AND unit = ? AND advisor_id = ? AND scheme_id = ?
          `).get(period, unit, advisorId, scheme.id);
          if (existing && ["Aprobada", "Rechazada", "Enviada a RRHH"].includes(existing.status)) {
            calculated.push({ advisor: row.advisor, skipped: true, reason: `Estado ${existing.status}` });
            continue;
          }

          const metrics = {
            objectiveTotal: row.objectiveTotal,
            salesTotal: row.salesTotal,
            fulfillmentTotal: row.fulfillmentTotal,
            clients: row.clients,
            clientsObjective: row.clientsObjective,
            clientsFulfillment: row.clientsFulfillment,
            categories: row.categories,
            pendingTotal: row.pendingTotal,
            projectedTotal: row.projectedTotal,
            warnings: summary.warnings,
          };

          let liquidationId;
          if (existing) {
            liquidationId = existing.id;
            db.prepare(`DELETE FROM commission_liquidation_items WHERE liquidation_id = ?`).run(liquidationId);
            db.prepare(`
              UPDATE commission_liquidations
              SET advisor_name = ?, scheme_name = ?, scheme_version = ?, status = 'Borrador',
                  objective_total = ?, sales_total = ?, fulfillment_total = ?, clients_sold = ?,
                  clients_objective = ?, collections_total = ?, base_commission = ?, metrics_json = ?,
                  calculation_json = ?, source_snapshot_json = NULL, updated_by = ?, updated_at = datetime('now'),
                  submitted_by = NULL, submitted_at = NULL, reviewed_by = NULL, reviewed_at = NULL,
                  review_observation = NULL, locked_at = NULL
              WHERE id = ?
            `).run(
              row.advisor, scheme.name, scheme.version, roundMoney(row.objectiveTotal), roundMoney(row.salesTotal),
              roundMoney(row.fulfillmentTotal), row.clients, roundMoney(row.clientsObjective),
              roundMoney(prepared.collectionSnapshot.total), prepared.result.baseCommission,
              JSON.stringify(metrics), JSON.stringify({ rules, items: prepared.result.items }), user, liquidationId
            );
            addHistory(liquidationId, "Recalculada", existing.status, "Borrador", "Recálculo mensual", user, role);
          } else {
            const result = db.prepare(`
              INSERT INTO commission_liquidations (
                period, unit, advisor_id, advisor_name, scheme_id, scheme_name, scheme_version, status,
                objective_total, sales_total, fulfillment_total, clients_sold, clients_objective,
                collections_total, base_commission, adjustments_total, final_total, metrics_json,
                calculation_json, created_by, created_at, updated_by, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Borrador', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
            `).run(
              period, unit, advisorId, row.advisor, scheme.id, scheme.name, scheme.version,
              roundMoney(row.objectiveTotal), roundMoney(row.salesTotal), roundMoney(row.fulfillmentTotal),
              row.clients, roundMoney(row.clientsObjective), roundMoney(prepared.collectionSnapshot.total),
              prepared.result.baseCommission, prepared.result.baseCommission,
              JSON.stringify(metrics), JSON.stringify({ rules, items: prepared.result.items }), user, user
            );
            liquidationId = result.lastInsertRowid;
            addHistory(liquidationId, "Calculada", null, "Borrador", "Preliquidación generada", user, role);
          }

          const insertItem = db.prepare(`
            INSERT INTO commission_liquidation_items (
              liquidation_id, item_type, category, channel, concept, base_amount,
              rate, quantity, amount, source_ref, source_payload, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `);
          prepared.result.items.forEach((item) => insertItem.run(
            liquidationId, item.itemType, item.category, item.channel, item.concept,
            item.baseAmount, item.rate, item.quantity, item.amount, item.sourceRef,
            JSON.stringify(item.sourcePayload || null)
          ));
          const totals = updateFinalTotal(liquidationId, user);
          calculated.push({ id: liquidationId, advisor: row.advisor, base: prepared.result.baseCommission, total: totals.finalTotal });
        }
      });

      const preparedRows = summary.rows.map((row) => {
        const collectionSnapshot = getCollectionsSnapshot(period, Number(row.advisorId || 0), row.advisor);
        return { row, collectionSnapshot, result: calculateAdvisor(row, rules, unit, collectionSnapshot) };
      });
      transaction(preparedRows);
      res.json({ ok: true, period, unit, scheme: schemeRow(scheme), calculated, warnings: summary.warnings });
    } catch (error) {
      console.error("ERROR CALCULANDO COMISIONES:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/commissions/liquidations/:id/adjustments", (req, res) => {
    const role = requireRole(req, res, MANAGE_ROLES);
    if (!role) return;
    const liquidation = db.prepare(`SELECT * FROM commission_liquidations WHERE id = ?`).get(req.params.id);
    if (!liquidation) return res.status(404).json({ error: "Liquidación no encontrada." });
    if (!["Borrador", "Devuelta"].includes(liquidation.status)) return res.status(409).json({ error: "La liquidación ya no admite ajustes." });
    const body = req.body || {};
    const rawAmount = Math.abs(toNumber(body.amount));
    if (!rawAmount || !String(body.concept || "").trim()) return res.status(400).json({ error: "Concepto e importe son obligatorios." });
    const signedAmount = body.adjustmentType === "penalizacion" ? -rawAmount : rawAmount;
    const user = userFrom(req);
    const result = db.prepare(`
      INSERT INTO commission_adjustments (
        liquidation_id, adjustment_type, concept, amount, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(liquidation.id, body.adjustmentType === "penalizacion" ? "Penalización" : "Adicional", String(body.concept).trim(), signedAmount, String(body.notes || ""), user);
    const totals = updateFinalTotal(liquidation.id, user);
    addHistory(liquidation.id, "Ajuste manual", liquidation.status, liquidation.status, `${body.concept}: ${signedAmount}`, user, role);
    res.status(201).json({ adjustmentId: result.lastInsertRowid, ...totals });
  });

  app.delete("/api/commissions/liquidations/:id/adjustments/:adjustmentId", (req, res) => {
    const role = requireRole(req, res, MANAGE_ROLES);
    if (!role) return;
    const liquidation = db.prepare(`SELECT * FROM commission_liquidations WHERE id = ?`).get(req.params.id);
    if (!liquidation) return res.status(404).json({ error: "Liquidación no encontrada." });
    if (!["Borrador", "Devuelta"].includes(liquidation.status)) return res.status(409).json({ error: "La liquidación ya no admite cambios." });
    db.prepare(`DELETE FROM commission_adjustments WHERE id = ? AND liquidation_id = ?`).run(req.params.adjustmentId, liquidation.id);
    const totals = updateFinalTotal(liquidation.id, userFrom(req));
    res.json({ ok: true, ...totals });
  });

  app.post("/api/commissions/liquidations/:id/snapshot", async (req, res) => {
    if (!requireRole(req, res, MANAGE_ROLES)) return;
    try {
      const liquidation = db.prepare(`SELECT * FROM commission_liquidations WHERE id = ?`).get(req.params.id);
      if (!liquidation) return res.status(404).json({ error: "Liquidación no encontrada." });
      if (!["Borrador", "Devuelta"].includes(liquidation.status)) {
        return res.status(409).json({ error: "El detalle está congelado y ya no puede actualizarse." });
      }
      const snapshot = await buildSourceSnapshot(liquidation);
      db.prepare(`UPDATE commission_liquidations SET source_snapshot_json = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(snapshot), liquidation.id);
      res.json(snapshot);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/commissions/liquidations/:id/action", async (req, res) => {
    const liquidation = db.prepare(`SELECT * FROM commission_liquidations WHERE id = ?`).get(req.params.id);
    if (!liquidation) return res.status(404).json({ error: "Liquidación no encontrada." });
    const role = roleFrom(req);
    const action = String(req.body?.action || "").toLowerCase();
    const comments = String(req.body?.comments || "").trim();
    const user = userFrom(req);
    let nextStatus;

    if (action === "submit") {
      if (!MANAGE_ROLES.has(role)) return res.status(403).json({ error: "Solo Supervisor/Jefe puede enviar a RRHH." });
      if (!["Borrador", "Devuelta"].includes(liquidation.status)) return res.status(409).json({ error: "La liquidación no está disponible para envío." });
      nextStatus = "Enviada a RRHH";
      try {
        const snapshot = liquidation.source_snapshot_json ? parseJson(liquidation.source_snapshot_json, null) : await buildSourceSnapshot(liquidation);
        db.prepare(`
          UPDATE commission_liquidations
          SET status = ?, source_snapshot_json = ?, submitted_by = ?, submitted_at = datetime('now'),
              review_observation = NULL, updated_by = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(nextStatus, JSON.stringify(snapshot), user, user, liquidation.id);
      } catch (error) {
        return res.status(500).json({ error: `No se pudo congelar el detalle antes de enviar: ${error.message}` });
      }
      createNotification({ userRole: "rrhh", title: "Liquidación pendiente de aprobación", message: `${liquidation.advisor_name} · ${liquidation.period} · ${liquidation.unit}.`, requestId: liquidation.id });
    } else if (["approve", "return", "reject"].includes(action)) {
      if (!HR_ROLES.has(role)) return res.status(403).json({ error: "Solo RRHH puede resolver una liquidación." });
      if (liquidation.status !== "Enviada a RRHH") return res.status(409).json({ error: "La liquidación no está pendiente de RRHH." });
      if (["return", "reject"].includes(action) && !comments) return res.status(400).json({ error: "La observación es obligatoria." });
      nextStatus = action === "approve" ? "Aprobada" : action === "return" ? "Devuelta" : "Rechazada";
      db.prepare(`
        UPDATE commission_liquidations
        SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_observation = ?,
            locked_at = CASE WHEN ? IN ('Aprobada', 'Rechazada') THEN datetime('now') ELSE NULL END,
            updated_by = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(nextStatus, user, comments || null, nextStatus, user, liquidation.id);
      createNotification({ userRole: "supervisor", title: `Liquidación ${nextStatus.toLowerCase()}`, message: `${liquidation.advisor_name} · ${liquidation.period}. ${comments}`, requestId: liquidation.id });
      createNotification({ userRole: "jefe", title: `Liquidación ${nextStatus.toLowerCase()}`, message: `${liquidation.advisor_name} · ${liquidation.period}. ${comments}`, requestId: liquidation.id });
    } else {
      return res.status(400).json({ error: "Acción inválida." });
    }

    addHistory(liquidation.id, action, liquidation.status, nextStatus, comments, user, role);
    res.json(liquidationRow(db.prepare(`SELECT * FROM commission_liquidations WHERE id = ?`).get(liquidation.id)));
  });

  app.get("/api/commissions/liquidations/:id/export.csv", (req, res) => {
    if (!requireRole(req, res, VIEW_ROLES)) return;
    const liquidation = db.prepare(`SELECT * FROM commission_liquidations WHERE id = ?`).get(req.params.id);
    if (!liquidation) return res.status(404).json({ error: "Liquidación no encontrada." });
    const items = db.prepare(`SELECT * FROM commission_liquidation_items WHERE liquidation_id = ? ORDER BY id`).all(liquidation.id);
    const adjustments = getAdjustments(liquidation.id);
    const rows = [
      ["RESUMEN", "Asesor", liquidation.advisor_name, "Periodo", liquidation.period, "Unidad", UNIT_META[liquidation.unit]?.label || liquidation.unit],
      ["RESUMEN", "Esquema", `${liquidation.scheme_name} v${liquidation.scheme_version}`, "Estado", liquidation.status, "Total final", liquidation.final_total],
      [],
      ["Tipo", "Concepto", "Rubro", "Canal", "Base", "Porcentaje", "Cantidad/Alcance", "Importe", "Fuente"],
      ...items.map((item) => [item.item_type, item.concept, item.category, item.channel, item.base_amount, item.rate, item.quantity, item.amount, item.source_ref]),
      ...adjustments.map((item) => [item.adjustment_type, item.concept, "", "", "", "", "", item.amount, item.notes]),
    ];
    const output = rows.map((line) => line.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=liquidacion-${liquidation.period}-${liquidation.advisor_name.replace(/[^a-zA-Z0-9-_]/g, "-")}.csv`);
    res.send(`\uFEFF${output}`);
  });

  app.get("/api/commissions/export.csv", (req, res) => {
    if (!requireRole(req, res, VIEW_ROLES)) return;
    const period = normalizePeriod(req.query.period);
    const unit = req.query.unit ? normalizeUnit(req.query.unit) : null;
    const rows = unit
      ? db.prepare(`SELECT * FROM commission_liquidations WHERE period = ? AND unit = ? ORDER BY advisor_name`).all(period, unit)
      : db.prepare(`SELECT * FROM commission_liquidations WHERE period = ? ORDER BY unit, advisor_name`).all(period);
    const headers = ["Periodo", "Unidad", "Asesor", "Esquema", "Version", "Estado", "Objetivo", "Facturado", "Alcance", "Clientes", "Cobranzas", "Comision base", "Ajustes", "Total final"];
    const output = [headers, ...rows.map((row) => [
      row.period, UNIT_META[row.unit]?.label || row.unit, row.advisor_name, row.scheme_name, row.scheme_version,
      row.status, row.objective_total, row.sales_total, row.fulfillment_total, row.clients_sold,
      row.collections_total, row.base_commission, row.adjustments_total, row.final_total,
    ])].map((line) => line.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=liquidaciones-${period}${unit ? `-${unit}` : ""}.csv`);
    res.send(`\uFEFF${output}`);
  });
};
