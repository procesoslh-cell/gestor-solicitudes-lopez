module.exports = function registerCommercialObjectivesRoutes(context) {
  const { app, db, queryOdoo, queryOdooCached } = context;
  const capabilityQuery = queryOdooCached || queryOdoo;

  const CLIENTS_OBJECTIVE_CATEGORY = "clientes_vendidos";

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

  function toNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function roundMoney(value) {
    return Math.round(toNumber(value) * 100) / 100;
  }

  function normalizeUnit(unit) {
    const key = String(unit || "ciclismo").toLowerCase();
    return UNITS[key] ? key : "ciclismo";
  }

  function normalizePeriod(period) {
    const raw = String(period || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    return new Date().toISOString().slice(0, 7);
  }

  function periodStart(period) {
    return `${normalizePeriod(period)}-01`;
  }

  function getCategories(unit) {
    return UNITS[normalizeUnit(unit)].categories;
  }

  function getObjective(row, category) {
    return roundMoney(row.objectives?.[category] || 0);
  }

  function getSale(row, category) {
    return roundMoney(row.sales?.[category] || 0);
  }

  function fulfillment(sale, objective) {
    return objective > 0 ? Math.round((sale / objective) * 10000) / 100 : null;
  }

  function projectionPercent(projected, objective) {
    return objective > 0 ? Math.round((projected / objective) * 10000) / 100 : null;
  }

  function makeAdvisorKey(advisorId, advisorName) {
    return advisorId ? `id:${advisorId}` : `name:${String(advisorName || "Sin asesor").toLowerCase()}`;
  }

  async function hasOdooColumn(table, column) {
    try {
      const rows = await capabilityQuery(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        LIMIT 1
        `,
        [table, column]
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  async function hasOdooTable(table) {
    try {
      const rows = await capabilityQuery(
        `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
        LIMIT 1
        `,
        [table]
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  async function getOdooCapabilities() {
    const [
      hasInvoiceUser,
      hasInvoiceOrigin,
      hasSaleInvoiceStatusLh,
      hasSaleInvoiceStatus,
      hasSalePricelist,
      hasPricelistTable,
    ] = await Promise.all([
      hasOdooColumn("account_move", "invoice_user_id"),
      hasOdooColumn("account_move", "invoice_origin"),
      hasOdooColumn("sale_order", "invoice_status_lh"),
      hasOdooColumn("sale_order", "invoice_status"),
      hasOdooColumn("sale_order", "pricelist_id"),
      hasOdooTable("product_pricelist"),
    ]);

    return {
      hasInvoiceUser,
      hasInvoiceOrigin,
      hasSaleInvoiceStatusLh,
      hasSaleInvoiceStatus,
      hasSalePricelist,
      hasPricelistTable,
    };
  }

  function safeTextSql(expression) {
    return `COALESCE(${expression}::text, '')`;
  }

  function buildProductBucketSql(unit, businessExpression = null) {
    // Clasificación basada en el maestro de productos que usa el tablero B2B:
    // pb.name = rubro/clasificación principal (BICIPARTES, PRO, URBANO, MOTOCICLISMO)
    // c1.name = familia, c2.name = subcategoría, c3.name = categoría/negocio.
    // Para Ciclismo: PRO/URBANO => Bicicletas, BICIPARTES => Bicipartes.
    // Para Motociclismo: rubro MOTOCICLISMO y categoría/negocio NEUMATICOS => Neumáticos;
    // el resto de MOTOCICLISMO => MIX.
    const rubroText = `UPPER(TRIM(${safeTextSql('pb.name')}))`;
    const categoriaText = `UPPER(TRIM(${safeTextSql('c3.name')}))`;
    const subcategoriaText = `UPPER(TRIM(${safeTextSql('c2.name')}))`;
    const familiaText = `UPPER(TRIM(${safeTextSql('c1.name')}))`;
    const fallbackText = `UPPER(CONCAT_WS(' ', ${businessExpression ? safeTextSql(businessExpression) : "''"}, ${safeTextSql('pt.name')}, ${safeTextSql('pp.default_code')}))`;

    const neumaticosCond = `(
      ${categoriaText} IN ('NEUMATICOS', 'NEUMÁTICOS')
      OR ${subcategoriaText} IN ('NEUMATICOS', 'NEUMÁTICOS', 'CAMARAS', 'CÁMARAS', 'CUBIERTAS')
      OR ${familiaText} IN ('NEUMATICOS', 'NEUMÁTICOS', 'CAMARAS', 'CÁMARAS', 'CUBIERTAS')
      OR ${fallbackText} ILIKE '%NEUMATIC%'
      OR ${fallbackText} ILIKE '%NEUMÁTIC%'
      OR ${fallbackText} ILIKE '%CAMARA%'
      OR ${fallbackText} ILIKE '%CÁMARA%'
      OR ${fallbackText} ILIKE '%CUBIERTA%'
    )`;

    if (normalizeUnit(unit) === "motociclismo") {
      return `CASE
        WHEN ${rubroText} = 'MOTOCICLISMO' AND ${neumaticosCond} THEN 'neumaticos'
        WHEN ${rubroText} = 'MOTOCICLISMO' THEN 'mix'
        ELSE 'otros'
      END`;
    }

    return `CASE
      WHEN ${rubroText} IN ('PRO', 'URBANO') THEN 'bicicletas'
      WHEN ${rubroText} = 'BICIPARTES' THEN 'bicipartes'
      ELSE 'otros'
    END`;
  }

  function buildSellerSql(capabilities) {
    const sellerIdExpr = capabilities.hasInvoiceUser
      ? "COALESCE(am.invoice_user_id, rp.user_id)"
      : "rp.user_id";
    const pendingSellerIdExpr = "rp.user_id";

    return { sellerIdExpr, pendingSellerIdExpr };
  }

  function applyAdvisorFilters({ filters, params, alias = "", advisorId, advisorName }) {
    const prefix = alias ? `${alias}.` : "";
    if (advisorId) {
      params.push(Number(advisorId));
      filters.push(`${prefix}advisor_id = $${params.length}`);
    } else if (advisorName) {
      params.push(String(advisorName));
      filters.push(`${prefix}advisor_name ILIKE $${params.length}`);
    }
  }

  function normalizeAdvisorIdList(value) {
    if (Array.isArray(value)) return value.map(Number).filter((item) => Number.isFinite(item) && item > 0);
    return String(value || "")
      .split(",")
      .map((item) => Number(String(item).trim()))
      .filter((item) => Number.isFinite(item) && item > 0);
  }

  function normalizeAdvisorNameList(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    return String(value || "")
      .split("||")
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function addAdvisorSelectionFilter(filters, params, { idExpression, nameExpression, advisorId, advisorName, advisorIds, advisorNames }) {
    const clauses = [];
    const idList = normalizeAdvisorIdList(advisorIds);
    if (advisorId) idList.push(Number(advisorId));
    const cleanIds = Array.from(new Set(idList.filter((item) => Number.isFinite(item) && item > 0)));

    if (cleanIds.length) {
      const placeholders = cleanIds.map((id) => {
        params.push(id);
        return `$${params.length}::int`;
      });
      clauses.push(`${idExpression} IN (${placeholders.join(",")})`);
    }

    const nameList = normalizeAdvisorNameList(advisorNames);
    if (advisorName) nameList.push(String(advisorName));
    const cleanNames = Array.from(new Set(nameList.map((item) => String(item || "").trim()).filter(Boolean)));

    if (cleanNames.length) {
      const nameClauses = cleanNames.map((name) => {
        params.push(`%${name}%`);
        return `${nameExpression} ILIKE $${params.length}::text`;
      });
      clauses.push(`(${nameClauses.join(" OR ")})`);
    }

    if (clauses.length) {
      filters.push(`(${clauses.join(" OR ")})`);
    }
  }

  function insertObjective({ period, unit, category, advisorId, advisorName, amount, user }) {
    const existing = db.prepare(`
      SELECT id
      FROM commercial_objectives
      WHERE period = ? AND unit = ? AND category = ? AND advisor_id = ?
    `).get(period, unit, category, advisorId || 0);

    if (existing) {
      db.prepare(`
        UPDATE commercial_objectives
        SET advisor_name = ?, amount = ?, status = 'Publicado', updated_by = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(advisorName || "Sin asesor", amount, user || "Sistema", existing.id);
      return;
    }

    db.prepare(`
      INSERT INTO commercial_objectives (
        period, unit, category, advisor_id, advisor_name, amount, status,
        created_by, updated_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'Publicado', ?, ?, datetime('now'), datetime('now'))
    `).run(
      period,
      unit,
      category,
      advisorId || 0,
      advisorName || "Sin asesor",
      amount,
      user || "Sistema",
      user || "Sistema"
    );
  }

  async function loadSalesFromOdoo({ period, unit, advisorId, advisorName, advisorIds, advisorNames, companyId }) {
    const capabilities = await getOdooCapabilities();
    const { sellerIdExpr, pendingSellerIdExpr } = buildSellerSql(capabilities);
    const bucketSql = buildProductBucketSql(unit, "aml.x_studio_unidad_de_negocio");
    const params = [periodStart(period), Number(companyId || process.env.ODOO_COMPANY_ID || 3)];
    const filters = [];

    addAdvisorSelectionFilter(filters, params, {
      idExpression: sellerIdExpr,
      nameExpression: "asesor_partner.name",
      advisorId,
      advisorName,
      advisorIds,
      advisorNames,
    });

    const extraWhere = filters.length ? `AND ${filters.join(" AND ")}` : "";
    const invoiceOriginJoin = capabilities.hasInvoiceOrigin
      ? "LEFT JOIN sale_order so ON am.invoice_origin = so.name"
      : "";
    const pricelistJoin = capabilities.hasInvoiceOrigin && capabilities.hasSalePricelist && capabilities.hasPricelistTable
      ? "LEFT JOIN product_pricelist pl ON pl.id = so.pricelist_id"
      : "";
    const listTypeExpr = capabilities.hasInvoiceOrigin && capabilities.hasSalePricelist && capabilities.hasPricelistTable
      ? "CASE WHEN COALESCE(pl.name::text, '') ILIKE '%Mostrador%' THEN 'mostrador' ELSE 'distribuidor' END"
      : "'distribuidor'";

    const salesRows = await queryOdoo(
      `
      WITH venta_raw AS (
        SELECT
          aml.date AS fecha,
          TO_CHAR(aml.date, 'YYYY-MM') AS mes,
          aml.move_name AS factura,
          aml.move_id,
          ${sellerIdExpr} AS advisor_id,
          COALESCE(asesor_partner.name, 'Sin asesor') AS advisor_name,
          CASE
            WHEN aml.move_name LIKE 'ROVENT/%'
              OR aml.move_name LIKE 'OVENT/%'
              OR COALESCE(apt.name::text, '') ILIKE '%VENTA- CONTENEDOR TIGRIS%'
            THEN 3
            ELSE aml.company_id
          END AS id_empresa,
          aml.product_id,
          aml.partner_id AS cliente_id,
          COALESCE(rp.display_name, rp.name, aml.partner_id::text) AS cliente_nombre,
          ${bucketSql} AS bucket,
          ${listTypeExpr} AS list_type,
          CASE
            WHEN aml.move_name LIKE 'RINTI%' THEN -ABS(COALESCE(aml.price_subtotal, 0))
            WHEN aml.move_name LIKE 'NC%' THEN -COALESCE(aml.price_subtotal, 0)
            ELSE COALESCE(aml.price_subtotal, 0)
          END AS subtotal_producto,
          CASE
            WHEN aml.move_name LIKE 'INTI%' THEN 'INTI'
            WHEN apt.id IN (1,56,75,76) THEN 'Descuento Pronto Pago'
            ELSE COALESCE(apt.name::text, '')
          END AS condicion_pago
        FROM account_move_line aml
        JOIN account_move am ON am.id = aml.move_id
        LEFT JOIN res_partner rp ON rp.id = aml.partner_id
        LEFT JOIN res_company rc ON rc.id = aml.company_id
        LEFT JOIN account_payment_term apt ON am.invoice_payment_term_id = apt.id
        LEFT JOIN res_users ru ON ru.id = ${sellerIdExpr}
        LEFT JOIN res_partner asesor_partner ON asesor_partner.id = ru.partner_id
        LEFT JOIN product_product pp ON pp.id = aml.product_id
        LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
        LEFT JOIN product_brand pb ON pb.id = pt.brand_id
        LEFT JOIN product_category c1 ON c1.id = pt.categ_id
        LEFT JOIN product_category c2 ON c2.id = c1.parent_id
        LEFT JOIN product_category c3 ON c3.id = c2.parent_id
        LEFT JOIN product_category pc ON pc.id = pt.categ_id
        ${invoiceOriginJoin}
        ${pricelistJoin}
        WHERE aml.account_id IN (564,137,1127,1378)
          AND COALESCE(aml.parent_state, am.state) = 'posted'
          AND aml.partner_id NOT IN (1,239307)
          AND aml.move_name NOT IN (
            'ROVENT/2025/00005',
            'FA-A 00002-00002285',
            'FA-A 00002-00002289',
            'RINTI/2025/00038',
            'RINTI/2025/00040'
          )
          AND aml.date >= $1::date
          AND aml.date < ($1::date + INTERVAL '1 month')
          AND aml.product_id IS NOT NULL
          ${extraWhere}
      ),
      venta_base AS (
        SELECT *
        FROM venta_raw
        WHERE id_empresa = $2::int
      ),
      descuentos_comerciales AS (
        SELECT
          am_d.invoice_user_id AS advisor_id,
          TO_CHAR(aml_d.date,'YYYY-MM') AS mes,
          SUM(
            CASE
              WHEN aml_d.move_name LIKE 'NC-%' THEN ABS(COALESCE(aml_d.price_subtotal, 0))
              ELSE ABS(COALESCE(aml_d.price_subtotal, 0)) * -1
            END
          ) AS descuento_comercial_total
        FROM account_move_line aml_d
        INNER JOIN account_move am_d ON aml_d.move_id = am_d.id
        WHERE aml_d.account_id IN (980,1162,1839,1858)
          AND COALESCE(aml_d.parent_state, am_d.state) = 'posted'
          AND aml_d.date >= $1::date
          AND aml_d.date < ($1::date + INTERVAL '1 month')
        GROUP BY am_d.invoice_user_id, TO_CHAR(aml_d.date,'YYYY-MM')
      ),
      descuentos_pp AS (
        SELECT
          am_d.invoice_user_id AS advisor_id,
          TO_CHAR(aml_d.date,'YYYY-MM') AS mes,
          SUM(ABS(COALESCE(aml_d.price_subtotal, 0))) * -1 AS descuento_pp_total
        FROM account_move_line aml_d
        INNER JOIN account_move am_d ON aml_d.move_id = am_d.id
        WHERE aml_d.account_id IN (926,1318)
          AND COALESCE(aml_d.parent_state, am_d.state) = 'posted'
          AND aml_d.date >= $1::date
          AND aml_d.date < ($1::date + INTERVAL '1 month')
        GROUP BY am_d.invoice_user_id, TO_CHAR(aml_d.date,'YYYY-MM')
      ),
      total_ventas_descuento AS (
        SELECT
          advisor_id,
          mes,
          SUM(subtotal_producto) AS total_ventas_descuento
        FROM venta_raw
        WHERE factura NOT LIKE 'NC-%'
          AND factura NOT LIKE 'RINTI%'
        GROUP BY advisor_id, mes
      ),
      total_ventas_pp AS (
        SELECT
          advisor_id,
          mes,
          SUM(subtotal_producto) AS total_ventas_pp
        FROM venta_raw
        WHERE condicion_pago = 'Descuento Pronto Pago'
        GROUP BY advisor_id, mes
      ),
      venta_calculada AS (
        SELECT
          v.*,
          CASE
            WHEN v.id_empresa = 3
              AND v.factura NOT LIKE 'NC-%'
              AND v.factura NOT LIKE 'RINTI%'
              AND COALESCE(tvd.total_ventas_descuento, 0) <> 0
            THEN v.subtotal_producto / tvd.total_ventas_descuento
            ELSE 0
          END AS participacion_descuento_comercial,
          CASE
            WHEN v.id_empresa = 3
              AND v.factura NOT LIKE 'NC-%'
              AND v.factura NOT LIKE 'RINTI%'
              AND COALESCE(tvd.total_ventas_descuento, 0) <> 0
            THEN -ABS(COALESCE(dc.descuento_comercial_total, 0) * (v.subtotal_producto / tvd.total_ventas_descuento))
            ELSE 0
          END AS descuento_comercial,
          CASE
            WHEN v.condicion_pago = 'Descuento Pronto Pago'
              AND COALESCE(tpp.total_ventas_pp, 0) <> 0
            THEN v.subtotal_producto / tpp.total_ventas_pp
            ELSE 0
          END AS participacion_pp,
          CASE
            WHEN v.condicion_pago = 'Descuento Pronto Pago'
              AND COALESCE(tpp.total_ventas_pp, 0) <> 0
            THEN COALESCE(dpp.descuento_pp_total, 0) * (v.subtotal_producto / tpp.total_ventas_pp)
            ELSE 0
          END AS descuento_pp
        FROM venta_base v
        LEFT JOIN descuentos_comerciales dc
          ON dc.advisor_id = v.advisor_id
         AND dc.mes = v.mes
        LEFT JOIN descuentos_pp dpp
          ON dpp.advisor_id = v.advisor_id
         AND dpp.mes = v.mes
        LEFT JOIN total_ventas_descuento tvd
          ON tvd.advisor_id = v.advisor_id
         AND tvd.mes = v.mes
        LEFT JOIN total_ventas_pp tpp
          ON tpp.advisor_id = v.advisor_id
         AND tpp.mes = v.mes
      )
      SELECT
        advisor_id,
        COALESCE(advisor_name, 'Sin asesor') AS advisor_name,
        bucket,
        list_type,
        COUNT(DISTINCT CASE WHEN factura NOT LIKE 'NC-%' THEN cliente_id END)::int AS clientes,
        ARRAY_AGG(DISTINCT CASE WHEN factura NOT LIKE 'NC-%' THEN cliente_id::text END) FILTER (WHERE factura NOT LIKE 'NC-%') AS client_ids,
        SUM(subtotal_producto)::numeric AS venta_bruta,
        SUM(descuento_comercial)::numeric AS descuento_comercial,
        SUM(descuento_pp)::numeric AS descuento_pp,
        SUM(subtotal_producto + descuento_comercial + descuento_pp)::numeric AS venta_neta
      FROM venta_calculada
      GROUP BY advisor_id, COALESCE(advisor_name, 'Sin asesor'), bucket, list_type
      ORDER BY advisor_name, bucket, list_type
      `,
      params
    );

    return { salesRows, capabilities, sellerIdExpr, pendingSellerIdExpr };
  }


  async function loadSalesAuditFromOdoo({ period, unit, advisorId, advisorName, advisorIds, advisorNames, companyId, bucket, listType, limit = 500, offset = 0, capabilities: suppliedCapabilities = null }) {
    const capabilities = suppliedCapabilities || await getOdooCapabilities();
    const { sellerIdExpr } = buildSellerSql(capabilities);
    const bucketSql = buildProductBucketSql(unit, "aml.x_studio_unidad_de_negocio");
    const params = [periodStart(period), Number(companyId || process.env.ODOO_COMPANY_ID || 3)];
    const filters = [];

    addAdvisorSelectionFilter(filters, params, {
      idExpression: sellerIdExpr,
      nameExpression: "asesor_partner.name",
      advisorId,
      advisorName,
      advisorIds,
      advisorNames,
    });

    const extraWhere = filters.length ? `AND ${filters.join(" AND ")}` : "";
    const invoiceOriginJoin = capabilities.hasInvoiceOrigin
      ? "LEFT JOIN sale_order so ON am.invoice_origin = so.name"
      : "";
    const pricelistJoin = capabilities.hasInvoiceOrigin && capabilities.hasSalePricelist && capabilities.hasPricelistTable
      ? "LEFT JOIN product_pricelist pl ON pl.id = so.pricelist_id"
      : "";
    const listTypeExpr = capabilities.hasInvoiceOrigin && capabilities.hasSalePricelist && capabilities.hasPricelistTable
      ? "CASE WHEN COALESCE(pl.name::text, '') ILIKE '%Mostrador%' THEN 'mostrador' ELSE 'distribuidor' END"
      : "'distribuidor'";
    const priceListExpr = capabilities.hasInvoiceOrigin && capabilities.hasSalePricelist && capabilities.hasPricelistTable
      ? "COALESCE(pl.name::text, '')"
      : "''";

    const auditFilters = ["bucket <> 'otros'"];
    if (bucket) {
      params.push(String(bucket));
      auditFilters.push(`bucket = $${params.length}::text`);
    }
    if (listType) {
      params.push(String(listType));
      auditFilters.push(`list_type = $${params.length}::text`);
    }
    const auditWhere = auditFilters.length ? `WHERE ${auditFilters.join(" AND ")}` : "";

    const baseCte = `
      WITH venta_raw AS (
        SELECT
          aml.date AS fecha,
          TO_CHAR(aml.date, 'YYYY-MM') AS mes,
          aml.move_name AS factura,
          aml.move_id,
          ${sellerIdExpr} AS advisor_id,
          COALESCE(asesor_partner.name, 'Sin asesor') AS advisor_name,
          CASE
            WHEN aml.move_name LIKE 'ROVENT/%'
              OR aml.move_name LIKE 'OVENT/%'
              OR COALESCE(apt.name::text, '') ILIKE '%VENTA- CONTENEDOR TIGRIS%'
            THEN 3
            ELSE aml.company_id
          END AS id_empresa,
          COALESCE(rc.name, '') AS nombre_empresa,
          aml.product_id,
          COALESCE(pp.default_code, '') AS sku,
          COALESCE(pt.name::text, '') AS producto_nombre,
          COALESCE(pb.name::text, '') AS rubro_maestro,
          COALESCE(c3.name::text, '') AS categoria_maestro,
          COALESCE(c2.name::text, '') AS subcategoria_maestro,
          COALESCE(c1.name::text, '') AS familia_maestro,
          aml.partner_id AS cliente_id,
          COALESCE(rp.display_name, rp.name, aml.partner_id::text) AS cliente_nombre,
          ${priceListExpr} AS lista_precios,
          ${bucketSql} AS bucket,
          ${listTypeExpr} AS list_type,
          CASE
            WHEN aml.move_name LIKE 'RINTI%' THEN -ABS(COALESCE(aml.price_subtotal, 0))
            WHEN aml.move_name LIKE 'NC%' THEN -COALESCE(aml.price_subtotal, 0)
            ELSE COALESCE(aml.price_subtotal, 0)
          END AS subtotal_producto,
          CASE
            WHEN aml.move_name LIKE 'INTI%' THEN 'INTI'
            WHEN apt.id IN (1,56,75,76) THEN 'Descuento Pronto Pago'
            ELSE COALESCE(apt.name::text, '')
          END AS condicion_pago
        FROM account_move_line aml
        JOIN account_move am ON am.id = aml.move_id
        LEFT JOIN res_partner rp ON rp.id = aml.partner_id
        LEFT JOIN res_company rc ON rc.id = aml.company_id
        LEFT JOIN account_payment_term apt ON am.invoice_payment_term_id = apt.id
        LEFT JOIN res_users ru ON ru.id = ${sellerIdExpr}
        LEFT JOIN res_partner asesor_partner ON asesor_partner.id = ru.partner_id
        LEFT JOIN product_product pp ON pp.id = aml.product_id
        LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
        LEFT JOIN product_brand pb ON pb.id = pt.brand_id
        LEFT JOIN product_category c1 ON c1.id = pt.categ_id
        LEFT JOIN product_category c2 ON c2.id = c1.parent_id
        LEFT JOIN product_category c3 ON c3.id = c2.parent_id
        ${invoiceOriginJoin}
        ${pricelistJoin}
        WHERE aml.account_id IN (564,137,1127,1378)
          AND COALESCE(aml.parent_state, am.state) = 'posted'
          AND aml.partner_id NOT IN (1,239307)
          AND aml.move_name NOT IN (
            'ROVENT/2025/00005',
            'FA-A 00002-00002285',
            'FA-A 00002-00002289',
            'RINTI/2025/00038',
            'RINTI/2025/00040'
          )
          AND aml.date >= $1::date
          AND aml.date < ($1::date + INTERVAL '1 month')
          AND aml.product_id IS NOT NULL
          ${extraWhere}
      ),
      venta_base AS (
        SELECT *
        FROM venta_raw
        WHERE id_empresa = $2::int
      ),
      descuentos_comerciales AS (
        SELECT
          am_d.invoice_user_id AS advisor_id,
          TO_CHAR(aml_d.date,'YYYY-MM') AS mes,
          SUM(
            CASE
              WHEN aml_d.move_name LIKE 'NC-%' THEN ABS(COALESCE(aml_d.price_subtotal, 0))
              ELSE ABS(COALESCE(aml_d.price_subtotal, 0)) * -1
            END
          ) AS descuento_comercial_total
        FROM account_move_line aml_d
        INNER JOIN account_move am_d ON aml_d.move_id = am_d.id
        WHERE aml_d.account_id IN (980,1162,1839,1858)
          AND COALESCE(aml_d.parent_state, am_d.state) = 'posted'
          AND aml_d.date >= $1::date
          AND aml_d.date < ($1::date + INTERVAL '1 month')
        GROUP BY am_d.invoice_user_id, TO_CHAR(aml_d.date,'YYYY-MM')
      ),
      descuentos_pp AS (
        SELECT
          am_d.invoice_user_id AS advisor_id,
          TO_CHAR(aml_d.date,'YYYY-MM') AS mes,
          SUM(ABS(COALESCE(aml_d.price_subtotal, 0))) * -1 AS descuento_pp_total
        FROM account_move_line aml_d
        INNER JOIN account_move am_d ON aml_d.move_id = am_d.id
        WHERE aml_d.account_id IN (926,1318)
          AND COALESCE(aml_d.parent_state, am_d.state) = 'posted'
          AND aml_d.date >= $1::date
          AND aml_d.date < ($1::date + INTERVAL '1 month')
        GROUP BY am_d.invoice_user_id, TO_CHAR(aml_d.date,'YYYY-MM')
      ),
      total_ventas_descuento AS (
        SELECT advisor_id, mes, SUM(subtotal_producto) AS total_ventas_descuento
        FROM venta_raw
        WHERE factura NOT LIKE 'NC-%'
          AND factura NOT LIKE 'RINTI%'
        GROUP BY advisor_id, mes
      ),
      total_ventas_pp AS (
        SELECT advisor_id, mes, SUM(subtotal_producto) AS total_ventas_pp
        FROM venta_raw
        WHERE condicion_pago = 'Descuento Pronto Pago'
        GROUP BY advisor_id, mes
      ),
      venta_calculada AS (
        SELECT
          v.*,
          COALESCE(tvd.total_ventas_descuento, 0) AS total_ventas_descuento,
          COALESCE(tpp.total_ventas_pp, 0) AS total_ventas_pp,
          COALESCE(dc.descuento_comercial_total, 0) AS bolsa_descuento_comercial,
          COALESCE(dpp.descuento_pp_total, 0) AS bolsa_descuento_pp,
          CASE
            WHEN v.id_empresa = 3
              AND v.factura NOT LIKE 'NC-%'
              AND v.factura NOT LIKE 'RINTI%'
              AND COALESCE(tvd.total_ventas_descuento, 0) <> 0
            THEN v.subtotal_producto / tvd.total_ventas_descuento
            ELSE 0
          END AS participacion_descuento_comercial,
          CASE
            WHEN v.id_empresa = 3
              AND v.factura NOT LIKE 'NC-%'
              AND v.factura NOT LIKE 'RINTI%'
              AND COALESCE(tvd.total_ventas_descuento, 0) <> 0
            THEN -ABS(COALESCE(dc.descuento_comercial_total, 0) * (v.subtotal_producto / tvd.total_ventas_descuento))
            ELSE 0
          END AS descuento_comercial,
          CASE
            WHEN v.condicion_pago = 'Descuento Pronto Pago'
              AND COALESCE(tpp.total_ventas_pp, 0) <> 0
            THEN v.subtotal_producto / tpp.total_ventas_pp
            ELSE 0
          END AS participacion_pp,
          CASE
            WHEN v.condicion_pago = 'Descuento Pronto Pago'
              AND COALESCE(tpp.total_ventas_pp, 0) <> 0
            THEN COALESCE(dpp.descuento_pp_total, 0) * (v.subtotal_producto / tpp.total_ventas_pp)
            ELSE 0
          END AS descuento_pp
        FROM venta_base v
        LEFT JOIN descuentos_comerciales dc ON dc.advisor_id = v.advisor_id AND dc.mes = v.mes
        LEFT JOIN descuentos_pp dpp ON dpp.advisor_id = v.advisor_id AND dpp.mes = v.mes
        LEFT JOIN total_ventas_descuento tvd ON tvd.advisor_id = v.advisor_id AND tvd.mes = v.mes
        LEFT JOIN total_ventas_pp tpp ON tpp.advisor_id = v.advisor_id AND tpp.mes = v.mes
      ),
      venta_final AS (
        SELECT *, (subtotal_producto + descuento_comercial + descuento_pp) AS venta_neta
        FROM venta_calculada
      )`;

    const summaryRows = await queryOdoo(
      `${baseCte}
      SELECT
        advisor_id,
        COALESCE(advisor_name, 'Sin asesor') AS advisor_name,
        bucket,
        list_type,
        COUNT(*)::int AS lineas,
        COUNT(DISTINCT factura)::int AS facturas,
        COUNT(DISTINCT CASE WHEN factura NOT LIKE 'NC-%' THEN cliente_id END)::int AS clientes,
        SUM(subtotal_producto)::numeric AS venta_bruta,
        SUM(descuento_comercial)::numeric AS descuento_comercial,
        SUM(descuento_pp)::numeric AS descuento_pp,
        SUM(venta_neta)::numeric AS venta_neta,
        SUM(total_ventas_descuento)::numeric AS control_total_ventas_descuento,
        SUM(total_ventas_pp)::numeric AS control_total_ventas_pp
      FROM venta_final
      ${auditWhere}
      GROUP BY advisor_id, COALESCE(advisor_name, 'Sin asesor'), bucket, list_type
      ORDER BY advisor_name, bucket, list_type`,
      params
    );

    const clientRows = await queryOdoo(
      `${baseCte}
      SELECT
        advisor_id,
        COALESCE(advisor_name, 'Sin asesor') AS advisor_name,
        cliente_id,
        cliente_nombre,
        COUNT(*)::int AS lineas,
        COUNT(DISTINCT factura)::int AS facturas,
        SUM(venta_neta)::numeric AS venta_neta,
        SUM(subtotal_producto)::numeric AS venta_bruta,
        SUM(descuento_comercial)::numeric AS descuento_comercial,
        SUM(descuento_pp)::numeric AS descuento_pp,
        STRING_AGG(DISTINCT bucket, ', ' ORDER BY bucket) AS buckets
      FROM venta_final
      ${auditWhere.replace("WHERE bucket <> 'otros'", "WHERE factura NOT LIKE 'NC-%' AND bucket <> 'otros'")}
      GROUP BY advisor_id, COALESCE(advisor_name, 'Sin asesor'), cliente_id, cliente_nombre
      ORDER BY advisor_name, cliente_nombre
      LIMIT 1000`,
      params
    );

    const detailParams = [...params, Math.min(Number(limit || 500), 2000), Math.max(Number(offset || 0), 0)];
    const detailRows = await queryOdoo(
      `${baseCte}
      SELECT
        fecha,
        mes,
        factura,
        move_id,
        advisor_id,
        COALESCE(advisor_name, 'Sin asesor') AS advisor_name,
        id_empresa,
        nombre_empresa,
        cliente_id,
        cliente_nombre,
        product_id,
        sku,
        producto_nombre,
        rubro_maestro,
        categoria_maestro,
        subcategoria_maestro,
        familia_maestro,
        lista_precios,
        bucket,
        list_type,
        condicion_pago,
        subtotal_producto::numeric AS venta_bruta,
        bolsa_descuento_comercial::numeric AS bolsa_descuento_comercial,
        total_ventas_descuento::numeric AS total_ventas_descuento,
        participacion_descuento_comercial::numeric AS participacion_descuento_comercial,
        descuento_comercial::numeric AS descuento_comercial,
        bolsa_descuento_pp::numeric AS bolsa_descuento_pp,
        total_ventas_pp::numeric AS total_ventas_pp,
        participacion_pp::numeric AS participacion_pp,
        descuento_pp::numeric AS descuento_pp,
        venta_neta::numeric AS venta_neta
      FROM venta_final
      ${auditWhere}
      ORDER BY advisor_name, fecha, factura, producto_nombre
      LIMIT $${detailParams.length - 1}::int OFFSET $${detailParams.length}::int`,
      detailParams
    );

    return { summaryRows, clientRows, detailRows };
  }

  function buildPendingLineSubtotalSql() {
    // sale_order_line.price_subtotal ya contempla cantidad y descuento de línea,
    // pero excluye IVA/impuestos. Se conserva un fallback equivalente por seguridad.
    return `COALESCE(
      sol.price_subtotal,
      COALESCE(sol.price_unit, 0)
        * COALESCE(sol.product_uom_qty, 0)
        * (1 - COALESCE(sol.discount, 0) / 100.0),
      0
    )`;
  }

  async function loadPendingFromOdoo({ period, unit, advisorId, advisorName, advisorIds, advisorNames, companyId, capabilities, pendingSellerIdExpr }) {
    const bucketSql = buildProductBucketSql(unit);
    const lineSubtotalSql = buildPendingLineSubtotalSql();
    const params = [periodStart(period), Number(companyId || process.env.ODOO_COMPANY_ID || 3)];
    const filters = [];

    addAdvisorSelectionFilter(filters, params, {
      idExpression: pendingSellerIdExpr,
      nameExpression: "asesor_partner.name",
      advisorId,
      advisorName,
      advisorIds,
      advisorNames,
    });

    const invoiceStatusFilters = [];
    if (capabilities.hasSaleInvoiceStatusLh) invoiceStatusFilters.push("so.invoice_status_lh = 'no'");
    if (capabilities.hasSaleInvoiceStatus) invoiceStatusFilters.push("so.invoice_status IN ('to invoice', 'no')");
    const invoiceStatusSql = invoiceStatusFilters.length ? `AND (${invoiceStatusFilters.join(" OR ")})` : "";
    const extraWhere = filters.length ? `AND ${filters.join(" AND ")}` : "";

    return queryOdoo(
      `
      WITH line_base AS (
        SELECT
          ${pendingSellerIdExpr} AS advisor_id,
          asesor_partner.name AS advisor_name,
          ${bucketSql} AS bucket,
          so.partner_id AS cliente_id,
          ${lineSubtotalSql} AS amount
        FROM sale_order_line sol
        JOIN sale_order so ON so.id = sol.order_id
        JOIN res_partner rp ON rp.id = so.partner_id
        LEFT JOIN res_users ru ON ru.id = ${pendingSellerIdExpr}
        LEFT JOIN res_partner asesor_partner ON asesor_partner.id = ru.partner_id
        LEFT JOIN product_product pp ON pp.id = sol.product_id
        LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
        LEFT JOIN product_brand pb ON pb.id = pt.brand_id
        LEFT JOIN product_category c1 ON c1.id = pt.categ_id
        LEFT JOIN product_category c2 ON c2.id = c1.parent_id
        LEFT JOIN product_category c3 ON c3.id = c2.parent_id
        LEFT JOIN product_category pc ON pc.id = pt.categ_id
        WHERE so.company_id = $2::int
          AND so.state IN ('sale', 'done')
          ${invoiceStatusSql}
          AND so.date_order >= $1::date
          AND so.date_order < ($1::date + INTERVAL '1 month')
          AND sol.product_id IS NOT NULL
          ${extraWhere}
      )
      SELECT
        advisor_id,
        COALESCE(advisor_name, 'Sin asesor') AS advisor_name,
        bucket,
        COUNT(DISTINCT cliente_id)::int AS clientes_pendientes,
        SUM(amount)::numeric AS confirmado
      FROM line_base
      WHERE bucket <> 'otros'
      GROUP BY advisor_id, COALESCE(advisor_name, 'Sin asesor'), bucket
      ORDER BY advisor_name, bucket
      `,
      params
    );
  }

  async function loadPendingAuditFromOdoo({ period, unit, advisorId, advisorName, advisorIds, advisorNames, companyId, bucket, listType, limit = 500, offset = 0, capabilities: suppliedCapabilities = null }) {
    const capabilities = suppliedCapabilities || await getOdooCapabilities();
    const { pendingSellerIdExpr } = buildSellerSql(capabilities);
    const bucketSql = buildProductBucketSql(unit);
    const lineSubtotalSql = buildPendingLineSubtotalSql();
    const params = [periodStart(period), Number(companyId || process.env.ODOO_COMPANY_ID || 3)];
    const filters = [];

    addAdvisorSelectionFilter(filters, params, {
      idExpression: pendingSellerIdExpr,
      nameExpression: "asesor_partner.name",
      advisorId,
      advisorName,
      advisorIds,
      advisorNames,
    });

    const invoiceStatusFilters = [];
    if (capabilities.hasSaleInvoiceStatusLh) invoiceStatusFilters.push("so.invoice_status_lh = 'no'");
    if (capabilities.hasSaleInvoiceStatus) invoiceStatusFilters.push("so.invoice_status IN ('to invoice', 'no')");
    const invoiceStatusSql = invoiceStatusFilters.length ? `AND (${invoiceStatusFilters.join(" OR ")})` : "";
    const extraWhere = filters.length ? `AND ${filters.join(" AND ")}` : "";

    const pricelistJoin = capabilities.hasSalePricelist && capabilities.hasPricelistTable
      ? "LEFT JOIN product_pricelist pl ON pl.id = so.pricelist_id"
      : "";
    const listTypeExpr = capabilities.hasSalePricelist && capabilities.hasPricelistTable
      ? "CASE WHEN COALESCE(pl.name::text, '') ILIKE '%Mostrador%' THEN 'mostrador' ELSE 'distribuidor' END"
      : "'distribuidor'";
    const priceListExpr = capabilities.hasSalePricelist && capabilities.hasPricelistTable
      ? "COALESCE(pl.name::text, '')"
      : "''";
    const invoiceStatusLhExpr = capabilities.hasSaleInvoiceStatusLh
      ? "COALESCE(so.invoice_status_lh::text, '')"
      : "''";
    const invoiceStatusExpr = capabilities.hasSaleInvoiceStatus
      ? "COALESCE(so.invoice_status::text, '')"
      : "''";

    const pendingFilters = ["bucket <> 'otros'"];
    if (bucket) {
      params.push(String(bucket));
      pendingFilters.push(`bucket = $${params.length}::text`);
    }
    if (listType) {
      params.push(String(listType));
      pendingFilters.push(`list_type = $${params.length}::text`);
    }
    const pendingWhere = `WHERE ${pendingFilters.join(" AND ")}`;

    const baseCte = `
      WITH line_base AS (
        SELECT
          so.id AS order_id,
          so.name AS pedido,
          so.date_order AS fecha_pedido,
          so.state AS estado_pedido,
          ${invoiceStatusLhExpr} AS estado_facturacion_lh,
          ${invoiceStatusExpr} AS estado_facturacion,
          ${pendingSellerIdExpr} AS advisor_id,
          COALESCE(asesor_partner.name, 'Sin asesor') AS advisor_name,
          so.partner_id AS cliente_id,
          COALESCE(rp.display_name, rp.name, so.partner_id::text) AS cliente_nombre,
          ${priceListExpr} AS lista_precios,
          ${listTypeExpr} AS list_type,
          ${bucketSql} AS bucket,
          sol.id AS order_line_id,
          sol.product_id,
          COALESCE(pp.default_code, '') AS sku,
          COALESCE(pt.name::text, '') AS producto_nombre,
          COALESCE(pb.name::text, '') AS rubro_maestro,
          COALESCE(c3.name::text, '') AS categoria_maestro,
          COALESCE(c2.name::text, '') AS subcategoria_maestro,
          COALESCE(c1.name::text, '') AS familia_maestro,
          COALESCE(sol.product_uom_qty, 0)::numeric AS cantidad_pedida,
          COALESCE(sol.qty_invoiced, 0)::numeric AS cantidad_facturada,
          COALESCE(sol.qty_to_invoice, 0)::numeric AS cantidad_a_facturar,
          COALESCE(sol.price_unit, 0)::numeric AS precio_unitario,
          COALESCE(sol.discount, 0)::numeric AS descuento_linea,
          (${lineSubtotalSql})::numeric AS subtotal_sin_impuestos
        FROM sale_order_line sol
        JOIN sale_order so ON so.id = sol.order_id
        JOIN res_partner rp ON rp.id = so.partner_id
        LEFT JOIN res_users ru ON ru.id = ${pendingSellerIdExpr}
        LEFT JOIN res_partner asesor_partner ON asesor_partner.id = ru.partner_id
        LEFT JOIN product_product pp ON pp.id = sol.product_id
        LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
        LEFT JOIN product_brand pb ON pb.id = pt.brand_id
        LEFT JOIN product_category c1 ON c1.id = pt.categ_id
        LEFT JOIN product_category c2 ON c2.id = c1.parent_id
        LEFT JOIN product_category c3 ON c3.id = c2.parent_id
        ${pricelistJoin}
        WHERE so.company_id = $2::int
          AND so.state IN ('sale', 'done')
          ${invoiceStatusSql}
          AND so.date_order >= $1::date
          AND so.date_order < ($1::date + INTERVAL '1 month')
          AND sol.product_id IS NOT NULL
          ${extraWhere}
      )`;

    const totalsRows = await queryOdoo(
      `${baseCte}
      SELECT
        COUNT(*)::int AS lineas,
        COUNT(DISTINCT order_id)::int AS pedidos,
        COUNT(DISTINCT cliente_id)::int AS clientes,
        SUM(cantidad_pedida)::numeric AS unidades,
        SUM(subtotal_sin_impuestos)::numeric AS monto_proyectado
      FROM line_base
      ${pendingWhere}`,
      params
    );

    const orderRows = await queryOdoo(
      `${baseCte}
      SELECT
        order_id,
        pedido,
        fecha_pedido,
        advisor_id,
        advisor_name,
        cliente_id,
        cliente_nombre,
        estado_pedido,
        estado_facturacion_lh,
        estado_facturacion,
        lista_precios,
        list_type,
        STRING_AGG(DISTINCT bucket, ', ' ORDER BY bucket) AS buckets,
        COUNT(*)::int AS lineas,
        SUM(cantidad_pedida)::numeric AS unidades,
        SUM(subtotal_sin_impuestos)::numeric AS monto_proyectado
      FROM line_base
      ${pendingWhere}
      GROUP BY
        order_id, pedido, fecha_pedido, advisor_id, advisor_name,
        cliente_id, cliente_nombre, estado_pedido, estado_facturacion_lh,
        estado_facturacion, lista_precios, list_type
      ORDER BY advisor_name, fecha_pedido, pedido
      LIMIT 1500`,
      params
    );

    const detailParams = [...params, Math.min(Number(limit || 500), 2000), Math.max(Number(offset || 0), 0)];
    const detailRows = await queryOdoo(
      `${baseCte}
      SELECT
        order_id,
        pedido,
        fecha_pedido,
        advisor_id,
        advisor_name,
        cliente_id,
        cliente_nombre,
        estado_pedido,
        estado_facturacion_lh,
        estado_facturacion,
        lista_precios,
        list_type,
        bucket,
        order_line_id,
        product_id,
        sku,
        producto_nombre,
        rubro_maestro,
        categoria_maestro,
        subcategoria_maestro,
        familia_maestro,
        cantidad_pedida,
        cantidad_facturada,
        cantidad_a_facturar,
        precio_unitario,
        descuento_linea,
        subtotal_sin_impuestos
      FROM line_base
      ${pendingWhere}
      ORDER BY advisor_name, fecha_pedido, pedido, producto_nombre
      LIMIT $${detailParams.length - 1}::int OFFSET $${detailParams.length}::int`,
      detailParams
    );

    const totals = totalsRows[0] || {};
    return {
      totals: {
        lineas: toNumber(totals.lineas),
        pedidos: toNumber(totals.pedidos),
        clientes: toNumber(totals.clientes),
        unidades: roundMoney(totals.unidades),
        montoProyectado: roundMoney(totals.monto_proyectado),
      },
      orders: orderRows,
      detail: detailRows,
    };
  }

  function mergeObjectives({ rowsByAdvisor, period, unit, advisorId, advisorName }) {
    const params = [period, unit];
    const where = ["period = ?", "unit = ?"];

    if (advisorId) {
      where.push("advisor_id = ?");
      params.push(Number(advisorId));
    } else if (advisorName) {
      where.push("advisor_name LIKE ?");
      params.push(`%${advisorName}%`);
    }

    const objectiveRows = db.prepare(`
      SELECT *
      FROM commercial_objectives
      WHERE ${where.join(" AND ")}
      ORDER BY advisor_name, category
    `).all(...params);

    for (const objective of objectiveRows) {
      const key = makeAdvisorKey(objective.advisor_id, objective.advisor_name);
      if (!rowsByAdvisor.has(key)) {
        rowsByAdvisor.set(key, {
          advisorId: objective.advisor_id || null,
          advisor: objective.advisor_name || "Sin asesor",
          sales: {},
          salesDistributor: {},
          salesStore: {},
          objectives: {},
          pending: {},
          clientsSet: new Set(),
          otherBusinessClientsSet: new Set(),
          otherBusinessSales: 0,
          clientsObjective: 0,
        });
      }
      if (objective.category === CLIENTS_OBJECTIVE_CATEGORY) {
        rowsByAdvisor.get(key).clientsObjective = roundMoney(objective.amount);
      } else {
        rowsByAdvisor.get(key).objectives[objective.category] = roundMoney(objective.amount);
      }
    }
  }

  function buildOutputRows(rowsByAdvisor, unit) {
    const categories = getCategories(unit);
    return Array.from(rowsByAdvisor.values())
      .map((row) => {
        const categoryData = {};
        let objectiveTotal = 0;
        let salesTotal = 0;
        let pendingTotal = 0;

        for (const category of categories) {
          const key = category.key;
          const objective = getObjective(row, key);
          const sale = getSale(row, key);
          const pending = roundMoney(row.pending?.[key] || 0);
          const projected = roundMoney(sale + pending);
          objectiveTotal += objective;
          salesTotal += sale;
          pendingTotal += pending;
          categoryData[key] = {
            label: category.label,
            objective,
            sale,
            distributor: roundMoney(row.salesDistributor?.[key] || 0),
            store: roundMoney(row.salesStore?.[key] || 0),
            pending,
            projected,
            fulfillment: fulfillment(sale, objective),
          };
        }

        const projectedTotal = roundMoney(salesTotal + pendingTotal);
        const fulfillmentTotal = fulfillment(salesTotal, objectiveTotal);
        const projectedPct = projectionPercent(projectedTotal, objectiveTotal);
        const remaining = roundMoney(Math.max(0, objectiveTotal - salesTotal));
        const status = objectiveTotal <= 0
          ? "Sin objetivo"
          : fulfillmentTotal >= 100
          ? "Cumplido"
          : projectedPct >= 100
          ? "Proyecta cumplir"
          : fulfillmentTotal >= 75
          ? "En seguimiento"
          : "A reforzar";

        return {
          advisorId: row.advisorId,
          advisor: row.advisor,
          categories: categoryData,
          objectiveTotal: roundMoney(objectiveTotal),
          salesTotal: roundMoney(salesTotal),
          pendingTotal: roundMoney(pendingTotal),
          projectedTotal,
          fulfillmentTotal,
          projectedPct,
          remaining,
          otherBusinessSales: roundMoney(row.otherBusinessSales || 0),
          otherBusinessClients: row.otherBusinessClientsSet?.size || 0,
          clients: row.clientsSet.size,
          clientsObjective: roundMoney(row.clientsObjective || 0),
          clientsFulfillment: fulfillment(row.clientsSet.size, row.clientsObjective || 0),
          clientsRemaining: Math.max(0, roundMoney(row.clientsObjective || 0) - row.clientsSet.size),
          status,
        };
      })
      .sort((a, b) => (b.salesTotal || 0) - (a.salesTotal || 0));
  }

  function buildKpis(rows) {
    const totals = rows.reduce(
      (acc, row) => {
        acc.objective += row.objectiveTotal;
        acc.sales += row.salesTotal;
        acc.pending += row.pendingTotal;
        acc.projected += row.projectedTotal;
        acc.otherBusinessSales += row.otherBusinessSales || 0;
        acc.clients += row.clients;
        acc.clientsObjective += row.clientsObjective || 0;
        if (row.status === "Cumplido") acc.completed += 1;
        if (row.status === "A reforzar") acc.atRisk += 1;
        return acc;
      },
      { objective: 0, sales: 0, pending: 0, projected: 0, otherBusinessSales: 0, clients: 0, clientsObjective: 0, completed: 0, atRisk: 0 }
    );

    totals.objective = roundMoney(totals.objective);
    totals.sales = roundMoney(totals.sales);
    totals.pending = roundMoney(totals.pending);
    totals.projected = roundMoney(totals.projected);
    totals.otherBusinessSales = roundMoney(totals.otherBusinessSales || 0);
    totals.fulfillment = fulfillment(totals.sales, totals.objective);
    totals.projectedPct = projectionPercent(totals.projected, totals.objective);
    totals.clientsFulfillment = fulfillment(totals.clients, totals.clientsObjective);
    totals.remaining = roundMoney(Math.max(0, totals.objective - totals.sales));
    totals.advisors = rows.length;
    return totals;
  }


  /* =========================
     SERVICIOS INTERNOS
     Reutilizados por Liquidación de Comisiones sin duplicar la lógica
     validada de Objetivos Comerciales.
  ========================= */
  async function buildCommercialObjectivesSummary(input = {}) {
    const unit = normalizeUnit(input.unit);
    const period = normalizePeriod(input.period);
    const role = String(input.role || "");
    const advisorId = input.advisorId || (role === "vendedor" ? input.odooUserId : "");
    const advisorName = role === "vendedor" && !advisorId ? input.userName : input.advisorName;
    const advisorIds = input.advisorIds || "";
    const advisorNames = input.advisorNames || "";
    const companyId = input.companyId;
    const rowsByAdvisor = new Map();
    const warnings = [];

    try {
      const { salesRows, capabilities, pendingSellerIdExpr } = await loadSalesFromOdoo({
        period,
        unit,
        advisorId,
        advisorName,
        advisorIds,
        advisorNames,
        companyId,
      });

      for (const sale of salesRows) {
        const key = makeAdvisorKey(sale.advisor_id, sale.advisor_name);
        if (!rowsByAdvisor.has(key)) {
          rowsByAdvisor.set(key, {
            advisorId: sale.advisor_id || null,
            advisor: sale.advisor_name || "Sin asesor",
            sales: {},
            salesDistributor: {},
            salesStore: {},
            objectives: {},
            pending: {},
            clientsSet: new Set(),
            otherBusinessClientsSet: new Set(),
            otherBusinessSales: 0,
            clientsObjective: 0,
          });
        }

        const row = rowsByAdvisor.get(key);
        const bucket = sale.bucket;
        const amount = roundMoney(sale.venta_neta);
        const clientIds = Array.isArray(sale.client_ids)
          ? sale.client_ids
          : String(sale.client_ids || "")
              .replace(/[{}]/g, "")
              .split(",")
              .filter(Boolean);

        if (bucket === "otros") {
          row.otherBusinessSales = roundMoney((row.otherBusinessSales || 0) + amount);
          for (const clientId of clientIds) row.otherBusinessClientsSet.add(String(clientId));
          continue;
        }

        row.sales[bucket] = roundMoney((row.sales[bucket] || 0) + amount);
        if (sale.list_type === "mostrador") {
          row.salesStore[bucket] = roundMoney((row.salesStore[bucket] || 0) + amount);
        } else {
          row.salesDistributor[bucket] = roundMoney((row.salesDistributor?.[bucket] || 0) + amount);
        }
        for (const clientId of clientIds) row.clientsSet.add(String(clientId));
      }

      try {
        const pendingRows = await loadPendingFromOdoo({
          period,
          unit,
          advisorId,
          advisorName,
          advisorIds,
          advisorNames,
          companyId,
          capabilities,
          pendingSellerIdExpr,
        });

        for (const pending of pendingRows) {
          const key = makeAdvisorKey(pending.advisor_id, pending.advisor_name);
          if (!rowsByAdvisor.has(key)) {
            rowsByAdvisor.set(key, {
              advisorId: pending.advisor_id || null,
              advisor: pending.advisor_name || "Sin asesor",
              sales: {},
              salesDistributor: {},
              salesStore: {},
              objectives: {},
              pending: {},
              clientsSet: new Set(),
              otherBusinessClientsSet: new Set(),
              otherBusinessSales: 0,
              clientsObjective: 0,
            });
          }
          const row = rowsByAdvisor.get(key);
          row.pending[pending.bucket] = roundMoney((row.pending[pending.bucket] || 0) + pending.confirmado);
        }
      } catch (pendingError) {
        warnings.push(`No se pudo calcular A facturar: ${pendingError.message}`);
      }
    } catch (salesError) {
      warnings.push(`No se pudo consultar ventas Odoo: ${salesError.message}`);
    }

    mergeObjectives({ rowsByAdvisor, period, unit, advisorId, advisorName });
    const rows = buildOutputRows(rowsByAdvisor, unit);

    return {
      period,
      unit,
      unitLabel: UNITS[unit].label,
      categories: getCategories(unit),
      kpis: buildKpis(rows),
      rows,
      warnings,
    };
  }

  async function buildCommercialObjectivesAudit(input = {}) {
    const unit = normalizeUnit(input.unit);
    const period = normalizePeriod(input.period);
    const role = String(input.role || "");
    const advisorId = input.advisorId || (role === "vendedor" ? input.odooUserId : "");
    const advisorName = role === "vendedor" && !advisorId ? input.userName : input.advisorName;
    const advisorIds = input.advisorIds || "";
    const advisorNames = input.advisorNames || "";
    const companyId = input.companyId;
    const bucket = input.bucket || "";
    const listType = input.listType || "";
    const limit = Number(input.limit || 500);
    const offset = Number(input.offset || 0);

    const capabilities = await getOdooCapabilities();
    const [salesAudit, pendingAudit] = await Promise.all([
      loadSalesAuditFromOdoo({
        period,
        unit,
        advisorId,
        advisorName,
        advisorIds,
        advisorNames,
        companyId,
        bucket,
        listType,
        limit,
        offset,
        capabilities,
      }),
      loadPendingAuditFromOdoo({
        period,
        unit,
        advisorId,
        advisorName,
        advisorIds,
        advisorNames,
        companyId,
        bucket,
        listType,
        limit,
        offset,
        capabilities,
      }),
    ]);

    const { summaryRows, clientRows, detailRows } = salesAudit;
    const totals = summaryRows.reduce((acc, row) => {
      acc.lineas += toNumber(row.lineas);
      acc.facturas += toNumber(row.facturas);
      acc.clientes += toNumber(row.clientes);
      acc.ventaBruta += toNumber(row.venta_bruta);
      acc.descuentoComercial += toNumber(row.descuento_comercial);
      acc.descuentoPp += toNumber(row.descuento_pp);
      acc.ventaNeta += toNumber(row.venta_neta);
      return acc;
    }, { lineas: 0, facturas: 0, clientes: 0, ventaBruta: 0, descuentoComercial: 0, descuentoPp: 0, ventaNeta: 0 });

    Object.keys(totals).forEach((key) => {
      if (typeof totals[key] === "number") totals[key] = roundMoney(totals[key]);
    });
    totals.aFacturarSinImpuestos = roundMoney(pendingAudit.totals.montoProyectado);
    totals.proyectadoTotal = roundMoney(totals.ventaNeta + totals.aFacturarSinImpuestos);

    return {
      period,
      unit,
      unitLabel: UNITS[unit].label,
      categories: getCategories(unit),
      filters: { advisorId, advisorName, companyId, bucket, listType, limit, offset },
      totals,
      summary: summaryRows,
      clients: clientRows,
      detail: detailRows,
      projected: pendingAudit,
    };
  }

  context.buildCommercialObjectivesSummary = buildCommercialObjectivesSummary;
  context.buildCommercialObjectivesAudit = buildCommercialObjectivesAudit;

  app.get("/api/commercial-objectives/summary", async (req, res) => {
    try {
      const unit = normalizeUnit(req.query.unit);
      const period = normalizePeriod(req.query.period);
      const role = String(req.query.role || "");
      const advisorId = req.query.advisorId || (role === "vendedor" ? req.query.odooUserId : "");
      const advisorName = role === "vendedor" && !advisorId ? req.query.userName : req.query.advisorName;
      const advisorIds = req.query.advisorIds || "";
      const advisorNames = req.query.advisorNames || "";
      const companyId = req.query.companyId;
      const rowsByAdvisor = new Map();
      const warnings = [];

      try {
        const { salesRows, capabilities, pendingSellerIdExpr } = await loadSalesFromOdoo({ period, unit, advisorId, advisorName, advisorIds, advisorNames, companyId });
        for (const sale of salesRows) {
          const key = makeAdvisorKey(sale.advisor_id, sale.advisor_name);
          if (!rowsByAdvisor.has(key)) {
            rowsByAdvisor.set(key, {
              advisorId: sale.advisor_id || null,
              advisor: sale.advisor_name || "Sin asesor",
              sales: {},
              salesDistributor: {},
              salesStore: {},
              objectives: {},
              pending: {},
              clientsSet: new Set(),
              otherBusinessClientsSet: new Set(),
              otherBusinessSales: 0,
              clientsObjective: 0,
            });
          }
          const row = rowsByAdvisor.get(key);
          const bucket = sale.bucket;
          const amount = roundMoney(sale.venta_neta);
          const clientIds = Array.isArray(sale.client_ids)
            ? sale.client_ids
            : String(sale.client_ids || "")
                .replace(/[{}]/g, "")
                .split(",")
                .filter(Boolean);

          if (bucket === "otros") {
            row.otherBusinessSales = roundMoney((row.otherBusinessSales || 0) + amount);
            for (const clientId of clientIds) {
              row.otherBusinessClientsSet.add(String(clientId));
            }
            continue;
          }

          row.sales[bucket] = roundMoney((row.sales[bucket] || 0) + amount);
          if (sale.list_type === "mostrador") {
            row.salesStore[bucket] = roundMoney((row.salesStore[bucket] || 0) + amount);
          } else {
            row.salesDistributor[bucket] = roundMoney((row.salesDistributor[bucket] || 0) + amount);
          }
          for (const clientId of clientIds) {
            row.clientsSet.add(String(clientId));
          }
        }

        try {
          const pendingRows = await loadPendingFromOdoo({ period, unit, advisorId, advisorName, advisorIds, advisorNames, companyId, capabilities, pendingSellerIdExpr });
          for (const pending of pendingRows) {
            const key = makeAdvisorKey(pending.advisor_id, pending.advisor_name);
            if (!rowsByAdvisor.has(key)) {
              rowsByAdvisor.set(key, {
                advisorId: pending.advisor_id || null,
                advisor: pending.advisor_name || "Sin asesor",
                sales: {},
                salesDistributor: {},
                salesStore: {},
                objectives: {},
                pending: {},
                clientsSet: new Set(),
                otherBusinessClientsSet: new Set(),
                otherBusinessSales: 0,
                clientsObjective: 0,
              });
            }
            const row = rowsByAdvisor.get(key);
            row.pending[pending.bucket] = roundMoney((row.pending[pending.bucket] || 0) + pending.confirmado);
          }
        } catch (pendingError) {
          warnings.push(`No se pudo calcular A facturar: ${pendingError.message}`);
        }
      } catch (salesError) {
        warnings.push(`No se pudo consultar ventas Odoo: ${salesError.message}`);
      }

      mergeObjectives({ rowsByAdvisor, period, unit, advisorId, advisorName });
      const rows = buildOutputRows(rowsByAdvisor, unit);

      res.json({
        period,
        unit,
        unitLabel: UNITS[unit].label,
        categories: getCategories(unit),
        kpis: buildKpis(rows),
        rows,
        warnings,
      });
    } catch (error) {
      console.error("ERROR COMMERCIAL OBJECTIVES SUMMARY:", error);
      res.status(500).json({ error: error.message });
    }
  });


  app.get("/api/commercial-objectives/audit", async (req, res) => {
    try {
      const unit = normalizeUnit(req.query.unit);
      const period = normalizePeriod(req.query.period);
      const role = String(req.query.role || "");
      const advisorId = req.query.advisorId || (role === "vendedor" ? req.query.odooUserId : "");
      const advisorName = role === "vendedor" && !advisorId ? req.query.userName : req.query.advisorName;
      const advisorIds = req.query.advisorIds || "";
      const advisorNames = req.query.advisorNames || "";
      const companyId = req.query.companyId;
      const bucket = req.query.bucket || "";
      const listType = req.query.listType || "";
      const limit = Number(req.query.limit || 500);
      const offset = Number(req.query.offset || 0);

      const capabilities = await getOdooCapabilities();
      const [salesAudit, pendingAudit] = await Promise.all([
        loadSalesAuditFromOdoo({
          period,
          unit,
          advisorId,
          advisorName,
          advisorIds,
          advisorNames,
          companyId,
          bucket,
          listType,
          limit,
          offset,
          capabilities,
        }),
        loadPendingAuditFromOdoo({
          period,
          unit,
          advisorId,
          advisorName,
          advisorIds,
          advisorNames,
          companyId,
          bucket,
          listType,
          limit,
          offset,
          capabilities,
        }),
      ]);
      const { summaryRows, clientRows, detailRows } = salesAudit;

      const totals = summaryRows.reduce((acc, row) => {
        acc.lineas += toNumber(row.lineas);
        acc.facturas += toNumber(row.facturas);
        acc.clientes += toNumber(row.clientes);
        acc.ventaBruta += toNumber(row.venta_bruta);
        acc.descuentoComercial += toNumber(row.descuento_comercial);
        acc.descuentoPp += toNumber(row.descuento_pp);
        acc.ventaNeta += toNumber(row.venta_neta);
        return acc;
      }, { lineas: 0, facturas: 0, clientes: 0, ventaBruta: 0, descuentoComercial: 0, descuentoPp: 0, ventaNeta: 0 });

      Object.keys(totals).forEach((key) => {
        if (typeof totals[key] === "number") totals[key] = roundMoney(totals[key]);
      });
      totals.aFacturarSinImpuestos = roundMoney(pendingAudit.totals.montoProyectado);
      totals.proyectadoTotal = roundMoney(totals.ventaNeta + totals.aFacturarSinImpuestos);

      res.json({
        period,
        unit,
        unitLabel: UNITS[unit].label,
        categories: getCategories(unit),
        filters: { advisorId, advisorName, companyId, bucket, listType, limit, offset },
        totals,
        summary: summaryRows,
        clients: clientRows,
        detail: detailRows,
        projected: pendingAudit,
      });
    } catch (error) {
      console.error("ERROR COMMERCIAL OBJECTIVES AUDIT:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/commercial-objectives/objectives", (req, res) => {
    try {
      const unit = normalizeUnit(req.query.unit);
      const period = normalizePeriod(req.query.period);
      const rows = db.prepare(`
        SELECT *
        FROM commercial_objectives
        WHERE period = ? AND unit = ?
        ORDER BY advisor_name, category
      `).all(period, unit);
      res.json({ period, unit, categories: getCategories(unit), rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/commercial-objectives/objectives", (req, res) => {
    try {
      const body = req.body || {};
      const unit = normalizeUnit(body.unit);
      const period = normalizePeriod(body.period);
      const categories = getCategories(unit).map((item) => item.key);
      const items = Array.isArray(body.items) ? body.items : [];
      const user = body.user || "Sistema";

      for (const item of items) {
        const advisorId = Number(item.advisorId || item.advisor_id || 0);
        const advisorName = item.advisor || item.advisorName || item.advisor_name || "Sin asesor";
        for (const category of categories) {
          insertObjective({
            period,
            unit,
            category,
            advisorId,
            advisorName,
            amount: roundMoney(item[category] || item.objectives?.[category] || 0),
            user,
          });
        }
        insertObjective({
          period,
          unit,
          category: CLIENTS_OBJECTIVE_CATEGORY,
          advisorId,
          advisorName,
          amount: roundMoney(item.clientsObjective || item.objetivoClientes || item.clientes_vendidos || 0),
          user,
        });
      }

      res.json({ ok: true, period, unit, saved: items.length });
    } catch (error) {
      console.error("ERROR SAVE COMMERCIAL OBJECTIVES:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/commercial-objectives/copy-previous", (req, res) => {
    try {
      const body = req.body || {};
      const unit = normalizeUnit(body.unit);
      const period = normalizePeriod(body.period);
      const date = new Date(`${period}-01T00:00:00`);
      date.setMonth(date.getMonth() - 1);
      const previousPeriod = date.toISOString().slice(0, 7);
      const rows = db.prepare(`
        SELECT *
        FROM commercial_objectives
        WHERE period = ? AND unit = ?
      `).all(previousPeriod, unit);

      for (const row of rows) {
        insertObjective({
          period,
          unit,
          category: row.category,
          advisorId: row.advisor_id,
          advisorName: row.advisor_name,
          amount: row.amount,
          user: body.user || "Sistema",
        });
      }

      res.json({ ok: true, copied: rows.length, from: previousPeriod, to: period, unit });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/commercial-objectives/advisors", async (req, res) => {
    try {
      const localRows = db.prepare(`
        SELECT DISTINCT advisor_id AS id, advisor_name AS name
        FROM commercial_objectives
        WHERE advisor_name IS NOT NULL AND advisor_name <> ''
        ORDER BY advisor_name
      `).all();

      let odooRows = [];
      try {
        const hasShareColumn = await hasOdooColumn("res_users", "share");
        const shareFilter = hasShareColumn ? "AND COALESCE(ru.share, false) = false" : "";
        odooRows = await queryOdoo(
          `
          SELECT DISTINCT ru.id, rp.name
          FROM account_move am
          JOIN res_users ru ON ru.id = am.invoice_user_id
          JOIN res_partner rp ON rp.id = ru.partner_id
          WHERE am.invoice_user_id IS NOT NULL
            AND COALESCE(ru.active, true) = true
            AND COALESCE(ru.login, '') <> ''
            ${shareFilter}
            AND am.date >= CURRENT_DATE - INTERVAL '24 months'
          ORDER BY rp.name
          LIMIT 300
          `,
          []
        );
      } catch {}

      const map = new Map();
      [...odooRows, ...localRows].forEach((row) => {
        if (!row.name) return;
        map.set(Number(row.id || 0) || row.name, {
          id: Number(row.id || 0) || null,
          name: row.name,
        });
      });

      res.json(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};
