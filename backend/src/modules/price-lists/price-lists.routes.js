const fs = require("fs");
const path = require("path");
const seed = require("./price-list-seed.json");

const CONFIG_FILE = path.join(__dirname, "price-list-config.json");
const PRODUCT_IMAGE_BASE_URL = String(
  process.env.PRODUCT_IMAGE_BASE_URL || "https://lopezbicipartes.com.ar"
).replace(/\/+$/, "");

const DEFAULT_PRICE_CONFIG = {
  cashDiscount: 0.08,
  ivaRate: 0.21,
  htmlStockMode: "status",
  lists: {
    bicipartes: { distribuidor: 0.35, mostrador: 0.28 },
    bicicletas: { distribuidor: 0.35, mostrador: 0.30 },
    motopartes: { distribuidor: 0.35, mostrador: 0.30 },
    movilidad: { distribuidor: 0.35, mostrador: 0.30 },
    autopartes: { distribuidor: 0.35, mostrador: 0.30 },
  },
};

function mergeConfig(config = {}) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_PRICE_CONFIG));
  if (typeof config.cashDiscount === "number") {
    merged.cashDiscount = Math.max(0, Math.min(1, config.cashDiscount));
  }
  if (typeof config.ivaRate === "number") {
    merged.ivaRate = Math.max(0, Math.min(1, config.ivaRate));
  }
  if (config.htmlStockMode) merged.htmlStockMode = config.htmlStockMode;
  Object.entries(config.lists || {}).forEach(([baseKey, values]) => {
    merged.lists[baseKey] = {
      ...(merged.lists[baseKey] || { distribuidor: 0.35, mostrador: 0.30 }),
      ...values,
    };
  });
  return merged;
}

function getPriceConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return mergeConfig();
    return mergeConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")));
  } catch (error) {
    console.warn("No se pudo leer configuracion de listas", error.message);
    return mergeConfig();
  }
}

function savePriceConfig(config) {
  const merged = mergeConfig(config);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

function discountForMeta(meta, config = getPriceConfig()) {
  const baseKey = meta?.baseKey || meta?.key || "";
  const listType = meta?.listType || "distribuidor";
  return Number(config.lists?.[baseKey]?.[listType] ?? (listType === "mostrador" ? 0.30 : 0.35));
}

function discountForListType(listType, config = getPriceConfig()) {
  if (listType === "mostrador") return 0.30;
  return 0.35;
}

function listTypeLabel(listType) {
  return listType === "mostrador" ? "Mostrador" : "Distribuidor";
}

const ASSET_URLS = {
  forteLogo:
    "https://lopezforte.com.ar/web/image/website/10/logo/Lopez%20Forte?unique=a5a8b40",
  forteBannerAsset: "asset://forte-moto-banner.webp",
  lhBiciLogo:
    "https://lopezbicipartes.com.ar/web/image/website/9/logo/B2B%20LH%20-%20Bicicleta?unique=d7d5ebf",
  bicycleBanner: "https://www.topmega.com.ar/media/wysiwyg/desktop_264.jpg",
  bicycleBrands: [
    "https://lopezbicipartes.com.ar/web/image/610636-ba6cc689/logos%20%283%29.jpg",
    "https://lopezbicipartes.com.ar/web/image/610634-b20aa263/logos%20%286%29.jpg",
  ],
  bicipartsBrands: [
    "https://lopezbicipartes.com.ar/web/image/623145-5ce315cc/logos%20%281%29.jpg",
    "https://lopezbicipartes.com.ar/web/image/624045-f9aa4dfd/logo%20%2815%29.jpg",
    "https://lopezbicipartes.com.ar/web/image/587705-7e667433/logos%20%2812%29.jpg",
    "https://lopezbicipartes.com.ar/web/image/601158-6454b67a/logos%20%288%29.jpg",
    "https://lopezbicipartes.com.ar/web/image/624046-9aff72e9/logos%20%2811%29.jpg",
    "https://lopezbicipartes.com.ar/web/image/624047-e62d0cdb/logos%20%282%29.jpg",
    "https://lopezbicipartes.com.ar/web/image/610637-7f86a81b/logos%20%289%29.jpg",
  ],
};
const BASE_LISTS = [
  {
    baseKey: "bicipartes",
    titleBase: "Bicipartes",
    business: "Bicipartes",
    description: "Lista responsive de bicipartes con categorías, subcategorías y familias.",
    source: "Odoo / fallback Excel base",
    layout: "catalog",
    theme: "cycling",
    logo: ASSET_URLS.lhBiciLogo,
    banner: ASSET_URLS.bicycleBanner,
    brandLogos: ASSET_URLS.bicipartsBrands,
    seedKey: "bicipartes",
  },
  {
    baseKey: "bicicletas",
    titleBase: "Bicicletas",
    business: "Ciclismo",
    description: "Lista responsive de bicicletas filtrada por marca y modelo.",
    source: "Odoo / fallback Excel base",
    layout: "bicycles",
    theme: "cycling",
    logo: ASSET_URLS.lhBiciLogo,
    banner: ASSET_URLS.bicycleBanner,
    brandLogos: ASSET_URLS.bicycleBrands,
    seedKey: "bicicletas",
  },
  {
    baseKey: "motopartes",
    titleBase: "Motopartes",
    business: "Motociclismo",
    description: "Lista responsive de motopartes agrupada por categoría, subcategoría y familia.",
    source: "Odoo",
    layout: "catalog",
    theme: "forte",
    logo: ASSET_URLS.forteLogo,
    banner: ASSET_URLS.forteBannerAsset,
    brandLogos: [],
    seedKey: "motopartes",
  },
  {
    baseKey: "movilidad",
    titleBase: "Movilidad Eléctrica",
    business: "Movilidad Eléctrica",
    description: "Lista responsive de movilidad eléctrica agrupada por categoría, subcategoría y familia.",
    source: "Odoo",
    layout: "catalog",
    theme: "cycling",
    logo: ASSET_URLS.lhBiciLogo,
    banner: ASSET_URLS.bicycleBanner,
    brandLogos: [],
    seedKey: "movilidad",
  },
  {
    baseKey: "autopartes",
    titleBase: "Autopartes / Neumáticos",
    business: "Autopartes",
    description: "Lista responsive de autopartes y neumáticos agrupada por categoría, subcategoría y familia.",
    source: "Odoo",
    layout: "catalog",
    theme: "forte",
    logo: ASSET_URLS.forteLogo,
    banner: ASSET_URLS.forteBannerAsset,
    brandLogos: [],
    seedKey: "autopartes",
  },
];

const LIST_META = BASE_LISTS.reduce((acc, list) => {
  ["distribuidor", "mostrador"].forEach((listType) => {
    const key = `${list.baseKey}-${listType}`;
    acc[key] = {
      ...list,
      key,
      baseKey: list.baseKey,
      listType,
      listTypeLabel: listTypeLabel(listType),
      title: `${list.titleBase} ${listTypeLabel(listType)}`,
    };
  });
  return acc;
}, {});
function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["true", "t", "1", "yes", "si", "sí"].includes(String(value).toLowerCase());
}

function money(value) {
  return toNumber(value).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function roundMoney(value) {
  return Math.round(toNumber(value));
}

function getStockValue(item) {
  return toNumber(item.availableStock ?? item.stock ?? item.stock_real ?? 0);
}

function productImageUrl(productId) {
  if (!productId) return "";
  return `${PRODUCT_IMAGE_BASE_URL}/web/image/product.product/${productId}/image_1024/`;
}

function calculatePrices(priceWithoutTax, meta = {}, config = getPriceConfig()) {
  const channelDiscount = discountForMeta(meta, config);
  const cashDiscount = Number(config.cashDiscount || 0);
  const ivaRate = Number(config.ivaRate || 0);
  const taxFactor = 1 + ivaRate;
  const netBase = toNumber(priceWithoutTax);

  return {
    priceBaseNet: roundMoney(netBase),
    priceBase: roundMoney(netBase * taxFactor),
    priceChannel: roundMoney(netBase * (1 - channelDiscount) * taxFactor),
    priceCash: roundMoney(netBase * (1 - channelDiscount) * (1 - cashDiscount) * taxFactor),
    ivaRate,
  };
}

function mapOdooRows(rows, meta = {}, config = getPriceConfig()) {
  return (rows || []).map((row) => {
    const pricing = calculatePrices(row.price_base, meta, config);
    const stock = toNumber(row.available_stock);

    return {
      sku: row.sku || "",
      name: row.product || "Sin nombre",
      model: row.model || "",
      brand: row.brand || "",
      rubro: row.rubro || row.brand || "",
      category: row.category || "Sin categoría",
      subcategory: row.subcategory || "Sin subcategoría",
      family: row.family || "Sin familia",
      business: row.business || "",
      segment: row.segment || "",
      productId: row.product_id || null,
      imageUrl: row.image_url || productImageUrl(row.product_id),
      websitePublished: toBoolean(row.website_published, false),
      stock,
      availableStock: stock,
      realStock: toNumber(row.stock_real),
      reservedStock: toNumber(row.reserved_stock),
      stockStatus: stock > 0 ? "Disponible" : "Consultar",
      priceBaseNet: pricing.priceBaseNet,
      priceBase: pricing.priceBase,
      priceChannel: pricing.priceChannel,
      priceDistributor: pricing.priceChannel,
      priceCash: pricing.priceCash,
      ivaRate: pricing.ivaRate,
      listType: meta.listType || "distribuidor",
      listTypeLabel: meta.listTypeLabel || "Distribuidor",
      inner: row.inner_presentation ?? null,
      master: row.master_presentation ?? null,
      minQty: row.min_qty ?? null,
      label: row.label || "",
      status: row.status || "",
    };
  });
}
function mapSeedRows(rows, meta = {}, config = getPriceConfig()) {
  return (rows || []).map((row) => {
    const pricing = calculatePrices(row.priceBaseNet ?? row.priceBase, meta, config);
    const stock = getStockValue(row);
    const productId = row.productId || row.product_id || null;

    return {
      ...row,
      productId,
      imageUrl: row.imageUrl || row.image_url || productImageUrl(productId),
      websitePublished: toBoolean(row.websitePublished ?? row.website_published, true),
      stock,
      availableStock: toNumber(row.availableStock ?? row.stock),
      realStock: toNumber(row.realStock ?? row.stockReal ?? row.stock),
      reservedStock: toNumber(row.reservedStock ?? 0),
      stockStatus: stock > 0 ? "Disponible" : "Consultar",
      priceBaseNet: pricing.priceBaseNet,
      priceBase: pricing.priceBase,
      priceChannel: pricing.priceChannel,
      priceDistributor: pricing.priceChannel,
      priceCash: pricing.priceCash,
      ivaRate: pricing.ivaRate,
      listType: meta.listType || row.listType || "distribuidor",
      listTypeLabel: meta.listTypeLabel || row.listTypeLabel || "Distribuidor",
    };
  });
}

function productSort(meta) {
  return (a, b) => {
    if (meta.layout === "bicycles") {
      return [a.brand, a.model, a.name, a.sku]
        .join("|")
        .localeCompare([b.brand, b.model, b.name, b.sku].join("|"), "es");
    }

    return [a.category, a.subcategory, a.family, a.name, a.sku]
      .join("|")
      .localeCompare([b.category, b.subcategory, b.family, b.name, b.sku].join("|"), "es");
  };
}

function filterProducts(products, query = {}, meta = {}) {
  const search = normalizeText(query.search);
  const category = normalizeText(query.category);
  const subcategory = normalizeText(query.subcategory);
  const family = normalizeText(query.family);
  const brand = normalizeText(query.brand);
  const model = normalizeText(query.model);
  const stockOnly = query.stockOnly !== "false";

  return [...products]
    .filter((item) => {
      if (stockOnly && getStockValue(item) <= 0) return false;

      if (meta.layout !== "bicycles") {
        if (category && normalizeText(item.category) !== category) return false;
        if (subcategory && normalizeText(item.subcategory) !== subcategory) return false;
        if (family && normalizeText(item.family) !== family) return false;
      }

      if (brand && normalizeText(item.brand) !== brand) return false;
      if (model && normalizeText(item.model) !== model) return false;

      if (search) {
        const haystack = normalizeText(
          `${item.sku} ${item.name} ${item.model} ${item.brand} ${item.category} ${item.subcategory} ${item.family}`
        );

        if (!haystack.includes(search)) return false;
      }

      return true;
    })
    .sort(productSort(meta));
}

function getFacets(products) {
  function uniq(field) {
    return Array.from(
      new Set(products.map((item) => item[field]).filter(Boolean))
    ).sort((a, b) => String(a).localeCompare(String(b), "es"));
  }

  return {
    categories: uniq("category"),
    subcategories: uniq("subcategory"),
    families: uniq("family"),
    brands: uniq("brand"),
    models: uniq("model"),
  };
}

function getSummary(products) {
  const available = products.filter((item) => getStockValue(item) > 0);
  const prices = available
    .map((item) => toNumber(item.priceDistributor))
    .filter((value) => value > 0);

  return {
    totalProducts: products.length,
    availableProducts: available.length,
    totalStock: available.reduce((acc, item) => acc + getStockValue(item), 0),
    minDistributor: prices.length ? Math.min(...prices) : 0,
    maxDistributor: prices.length ? Math.max(...prices) : 0,
  };
}

function buildWhereForList(meta) {
  const key = meta.baseKey || meta.key;

  if (key === "bicipartes") {
    return `AND UPPER(COALESCE(m.rubro,'')) = 'BICIPARTES'`;
  }

  if (key === "bicicletas") {
    return `AND UPPER(COALESCE(m.rubro,'')) IN ('PRO', 'URBANO')`;
  }

  if (key === "motopartes") {
    return `AND UPPER(COALESCE(m.rubro,'')) = 'MOTOCICLISMO'`;
  }

  if (key === "movilidad") {
    return `AND UPPER(COALESCE(m.rubro,'')) IN ('MOVILIDAD ELECTRICA', 'MOVILIDAD ELÉCTRICA')`;
  }

  if (key === "autopartes") {
    return `AND (UPPER(COALESCE(m.rubro,'')) = 'AUTOPARTES' OR UPPER(COALESCE(m.categoria,'')) = 'AUTOPARTES')`;
  }

  return "";
}
function buildOdooPriceListQuery(meta, filters = {}) {
  const search = String(filters.search || "").trim();
  const category = String(filters.category || "").trim();
  const subcategory = String(filters.subcategory || "").trim();
  const family = String(filters.family || "").trim();
  const brand = String(filters.brand || "").trim();
  const model = String(filters.model || "").trim();
  const stockOnly = filters.stockOnly !== "false";
  const publishedOnly = toBoolean(filters.publishedOnly, false);
  const limit = Math.min(Number(filters.limit || 3000), 10000);

  const params = [search, category, subcategory, family, brand, model, stockOnly, limit];

  const listWhere = buildWhereForList(meta);

  const orderBy = meta.layout === "bicycles"
    ? "m.marca NULLS LAST, m.modelo NULLS LAST, m.nombre NULLS LAST, m.sku NULLS LAST"
    : "m.categoria NULLS LAST, m.subcategoria NULLS LAST, m.familia NULLS LAST, m.nombre NULLS LAST, m.sku NULLS LAST";

  const sql = `
    WITH RECURSIVE
    precios AS (
      SELECT
        pp.id,
        MAX(CASE WHEN ppi.pricelist_id = 211 THEN ppi.fixed_price END) AS precio_bici,
        MAX(CASE WHEN ppi.pricelist_id = 212 THEN ppi.fixed_price END) AS precio_moto,
        MAX(CASE WHEN ppi.pricelist_id = 186 THEN ppi.fixed_price END) AS precio_lvn,
        MAX(CASE WHEN ppi.pricelist_id = 257 THEN ppi.fixed_price END) AS precio_auto
      FROM product_pricelist_item ppi
      JOIN product_template pt ON ppi.product_tmpl_id = pt.id
      JOIN product_product pp ON pp.product_tmpl_id = pt.id
      WHERE ppi.pricelist_id IN (211, 212, 186, 257)
      GROUP BY pp.id
    ),
    maestro AS (
      SELECT
        COALESCE(NULLIF(pt.default_code,''), NULLIF(vp.default_code,''), 'A' || vp.id::text) AS sku,
        pt.name->>'es_AR' AS nombre,
        COALESCE(pb.name, '') AS rubro,
        COALESCE(dpb.name->>'es_AR', '') AS marca,
        pm.name AS modelo,
        c1.name AS familia,
        c2.name AS subcategoria,
        c3.name AS categoria,
        c3.name AS negocio,
        COALESCE(dpb.name->>'es_AR', '') AS segmento,
        vp.id AS product_id,
        CASE
          WHEN UPPER(COALESCE(pb.name,'')) IN ('PRO','URBANO','BICIPARTES') THEN p.precio_bici
          WHEN UPPER(COALESCE(pb.name,'')) = 'MOTOCICLISMO' THEN p.precio_moto
          WHEN UPPER(COALESCE(pb.name,'')) = 'AUTOPARTES' OR UPPER(COALESCE(c3.name,'')) = 'AUTOPARTES' THEN p.precio_auto
          WHEN UPPER(COALESCE(pb.name,'')) IN ('MOVILIDAD ELECTRICA', 'MOVILIDAD ELÉCTRICA') THEN p.precio_lvn
          ELSE NULL
        END AS precio,
        pt.sale_ok AS venta,
        CASE
          WHEN LOWER(COALESCE(
            to_jsonb(pt)->>'is_published',
            to_jsonb(pt)->>'website_published',
            'false'
          )) IN ('true', 't', '1', 'yes') THEN TRUE
          ELSE FALSE
        END AS website_published,
        CASE
          WHEN pt.name->>'es_AR' ILIKE '*%' OR pt.name->>'es_AR' ILIKE 'ZZ%' THEN 'DISCONTINUADO'
          ELSE 'ACTIVO'
        END AS estado,
        master.presentacion AS master_presentacion,
        iner.presentacion AS inner_presentacion,
        pt.min_sale_qty AS min_qty
      FROM product_product vp
      JOIN product_template pt ON pt.id = vp.product_tmpl_id
      LEFT JOIN product_brand pb ON pt.brand_id = pb.id
      LEFT JOIN dr_product_brand dpb ON dpb.id = pt.dr_brand_id
      LEFT JOIN product_model pm ON pm.id = pt.model_brand_id
      LEFT JOIN product_category c1 ON pt.categ_id = c1.id
      LEFT JOIN product_category c2 ON c1.parent_id = c2.id
      LEFT JOIN product_category c3 ON c2.parent_id = c3.id
      LEFT JOIN product_category c4 ON c3.parent_id = c4.id
      LEFT JOIN precios p ON p.id = vp.id
      LEFT JOIN (SELECT product_id, qty AS presentacion FROM product_packaging WHERE package_type_id = 8) master ON master.product_id = vp.id
      LEFT JOIN (SELECT product_id, qty AS presentacion FROM product_packaging WHERE package_type_id = 7) iner ON iner.product_id = vp.id
    ),
    arbol_ubicaciones AS (
      SELECT
        sl.id,
        sl.name,
        sl.location_id,
        sl.usage,
        sl.is_sale_location,
        sw.name AS almacen,
        sl.name::text AS ubicacion,
        sl.name::text AS root_name
      FROM stock_location sl
      LEFT JOIN stock_warehouse sw ON sl.warehouse_id = sw.id
      WHERE sl.location_id IS NULL
      UNION ALL
      SELECT
        child.id,
        child.name,
        child.location_id,
        child.usage,
        child.is_sale_location,
        sw.name AS almacen,
        parent.ubicacion || '/' || child.name AS ubicacion,
        parent.root_name
      FROM stock_location child
      JOIN arbol_ubicaciones parent ON child.location_id = parent.id
      LEFT JOIN stock_warehouse sw ON child.warehouse_id = sw.id
    ),
    ubicaciones AS (
      SELECT id, usage, is_sale_location, almacen, ubicacion
      FROM arbol_ubicaciones
      WHERE root_name = 'Physical Locations'
    ),
    stock AS (
      SELECT
        m.sku,
        SUM(sq.quantity) AS stock_real,
        SUM(sq.reserved_quantity) AS reserved_stock,
        SUM(CASE WHEN m.venta = TRUE AND ubi.is_sale_location = TRUE THEN sq.quantity - sq.reserved_quantity ELSE 0 END)::int AS available_stock
      FROM stock_quant sq
      JOIN ubicaciones ubi ON ubi.id = sq.location_id
      JOIN maestro m ON m.product_id = sq.product_id
      WHERE ubi.almacen IN ('ALMACEN GRAM','PRINCIPAL','Rodamax E.A.S.','AREA54','CONSIGNACION','FABRICA','MELI FULL')
        AND ubi.usage = 'internal'
        AND NOT (
          ubi.ubicacion ILIKE '%AUDITORIA%' OR ubi.ubicacion ILIKE '%AUD%' OR ubi.ubicacion ILIKE '%DEVOLUCION%'
          OR ubi.ubicacion ILIKE '%SCRAP%' OR ubi.ubicacion ILIKE '%SCR-%' OR ubi.ubicacion ILIKE '%SALIDA-%'
          OR ubi.ubicacion ILIKE '%EN VIAJE%' OR ubi.ubicacion ILIKE '%EN ADUANA%' OR ubi.ubicacion ILIKE '%EN MUELLE LH%'
          OR ubi.ubicacion ILIKE '%EMBARCADO%' OR ubi.ubicacion ILIKE '%POST-PRODUCCIÓN%' OR ubi.ubicacion ILIKE '%PRE-PRODUCCIÓN%'
          OR ubi.ubicacion ILIKE '%GUARDADO%' OR ubi.ubicacion ILIKE '%REMISION%' OR ubi.ubicacion ILIKE '%CONTROL%'
        )
        AND ubi.ubicacion NOT LIKE 'LHSA/GRAM%'
      GROUP BY m.sku
    )
    SELECT
      m.sku,
      m.nombre AS product,
      m.marca AS brand,
      m.rubro AS rubro,
      m.modelo AS model,
      m.familia AS family,
      m.subcategoria AS subcategory,
      m.categoria AS category,
      m.negocio AS business,
      m.segmento AS segment,
      m.product_id,
      m.website_published,
      COALESCE(m.precio, 0) AS price_base,
      COALESCE(s.stock_real, 0) AS stock_real,
      COALESCE(s.available_stock, 0) AS available_stock,
      COALESCE(s.reserved_stock, 0) AS reserved_stock,
      m.master_presentacion,
      m.inner_presentacion,
      m.min_qty,
      m.estado AS status
    FROM maestro m
    LEFT JOIN stock s ON s.sku = m.sku
    WHERE m.venta = TRUE
      AND COALESCE(m.precio, 0) > 0
      ${listWhere}
      ${publishedOnly ? "AND m.website_published = TRUE" : ""}
      AND ($1 = '' OR m.sku ILIKE '%' || $1 || '%' OR m.nombre ILIKE '%' || $1 || '%' OR m.marca ILIKE '%' || $1 || '%' OR m.modelo ILIKE '%' || $1 || '%')
      AND ($2 = '' OR m.categoria = $2)
      AND ($3 = '' OR m.subcategoria = $3)
      AND ($4 = '' OR m.familia = $4)
      AND ($5 = '' OR m.marca = $5)
      AND ($6 = '' OR m.modelo = $6)
      AND ($7::boolean = false OR COALESCE(s.available_stock, 0) > 0)
    ORDER BY ${orderBy}
    LIMIT $8::int
  `;

  return { sql, params };
}

async function getProducts({ queryOdoo, meta, query }) {
  if (queryOdoo) {
    try {
      const { sql, params } = buildOdooPriceListQuery(meta, query);
      const rows = await queryOdoo(sql, params, { label: `price-list:${meta.key}`, ttlMs: Number(process.env.PRICE_LIST_CACHE_TTL_MS || 300000) });
      return {
        products: mapOdooRows(rows, meta),
        source: "odoo",
        warning: "",
      };
    } catch (error) {
      console.error("ERROR PRICE LIST ODOO:", error.message);

      const fallback = seed.lists[meta.seedKey || meta.key] || [];
      return {
        products: mapSeedRows(fallback, meta),
        source: "seed",
        warning: `No se pudo consultar Odoo. Se muestra base de respaldo: ${error.message}`,
      };
    }
  }

  return {
    products: mapSeedRows(seed.lists[meta.seedKey || meta.key] || [], meta),
    source: "seed",
    warning: "",
  };
}

function assetToDataUri(assetUrl) {
  if (!assetUrl || !assetUrl.startsWith("asset://")) return assetUrl;
  const filename = assetUrl.replace("asset://", "");
  const assetPath = path.join(__dirname, "assets", filename);
  try {
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    const base64 = fs.readFileSync(assetPath).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch (error) {
    console.warn("No se pudo cargar asset de lista", assetPath, error.message);
    return "";
  }
}

function imgTag(src, alt, className = "") {
  if (!src) return "";
  const finalSrc = assetToDataUri(src);
  if (!finalSrc) return "";
  return `<img src="${finalSrc}" alt="${alt}" class="${className}" loading="lazy" />`;
}

function buildHtml({ meta, products, stockMode, filters = {}, source = "odoo", config = getPriceConfig() }) {
  const generatedAt = new Date().toLocaleString("es-AR");
  const ivaPct = Math.round(Number(config.ivaRate || 0) * 100);
  const ivaMessage = ivaPct > 0 ? `Precios con IVA ${ivaPct}% incluido.` : "Precios sin IVA agregado.";
  const payload = JSON.stringify(products).replace(/</g, "\\u003c");
  const showRealStock = false;
  const isBicycles = meta.layout === "bicycles";
  const isForte = meta.theme === "forte";
  const brandLogos = (meta.brandLogos || [])
    .map((src, index) => imgTag(src, `Marca ${index + 1}`, "brand-logo"))
    .join("");
  const bannerSrc = assetToDataUri(meta.banner);
  const bannerStyle = bannerSrc ? `style="background-image:linear-gradient(90deg, rgba(3,7,18,.76), rgba(3,7,18,.22)), url('${bannerSrc}')"` : "";
  const logo = imgTag(meta.logo, meta.title, "main-logo");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lista de precios ${meta.titleBase}</title>
  <style>
    :root { --primary:${isForte ? "#d41422" : "#1d4ed8"}; --accent:${isForte ? "#28a745" : "#60a5fa"}; --navy:#0f172a; --bg:#eef2f7; --line:#dbe3ef; --muted:#64748b; --text:#0f172a; --ok:#16a34a; --dark:#171717; }
    * { box-sizing:border-box; }
    body { margin:0; font-family: Inter, Arial, sans-serif; background:var(--bg); color:var(--text); }
    .hero { background:${isForte ? "linear-gradient(135deg,#151515,#252525)" : "linear-gradient(135deg,#04113a,#1d4ed8)"}; color:white; padding:0; box-shadow:0 18px 50px rgba(15,23,42,.18); }
    .topline { max-width:1220px; margin:0 auto; min-height:80px; padding:16px 18px; display:flex; justify-content:space-between; align-items:center; gap:18px; }
    .main-logo { max-height:54px; max-width:250px; object-fit:contain; background:transparent; }
    .visual-hero { min-height:${isForte ? "280px" : "330px"}; background-size:cover; background-position:center; display:flex; align-items:flex-end; border-top:1px solid rgba(255,255,255,.12); }
    .hero-title { padding:24px 18px 28px; width:100%; max-width:1220px; margin:0 auto; display:flex; justify-content:space-between; gap:20px; align-items:flex-end; flex-wrap:wrap; }
    h1 { margin:0; font-size:32px; letter-spacing:-.04em; }
    .hero p { margin:8px 0 0; color:#dbeafe; }
    .stamp { background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22); padding:10px 14px; border-radius:16px; font-size:13px; }
    .brand-strip { background:white; border-bottom:1px solid var(--line); padding:12px 18px; display:flex; gap:18px; align-items:center; overflow:auto; }
    .brand-strip .brand-logo { max-height:42px; max-width:170px; object-fit:contain; flex:0 0 auto; }
    .wrap { max-width:1220px; margin:0 auto; padding:22px 16px 44px; }
    .notice { background:white; border:1px solid var(--line); border-radius:18px; padding:14px 16px; color:#334155; margin-bottom:18px; box-shadow:0 12px 35px rgba(15,23,42,.05); }
    .controls { display:grid; grid-template-columns:${isBicycles ? "2fr repeat(3,1fr)" : "2fr repeat(4,1fr)"}; gap:10px; background:white; border:1px solid var(--line); border-radius:22px; padding:14px; box-shadow:0 12px 35px rgba(15,23,42,.06); position:sticky; top:0; z-index:9; }
    input, select { height:44px; border:1px solid var(--line); border-radius:13px; padding:0 12px; font-size:14px; outline:none; background:white; }
    input:focus, select:focus { border-color:var(--primary); box-shadow:0 0 0 4px rgba(37,99,235,.12); }
    .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:18px 0; }
    .card { background:white; border:1px solid var(--line); border-radius:20px; padding:16px; box-shadow:0 12px 35px rgba(15,23,42,.05); }
    .card span { display:block; color:var(--muted); font-size:12px; font-weight:800; letter-spacing:.03em; }
    .card strong { display:block; margin-top:8px; font-size:24px; }
    .group { background:white; border:1px solid var(--line); border-radius:22px; overflow:hidden; margin:18px 0; box-shadow:0 12px 35px rgba(15,23,42,.05); }
    .category { background:#020617; color:white; padding:13px 16px; font-size:22px; font-weight:900; }
    .subcategory { background:var(--accent); color:white; padding:11px 16px; font-size:18px; font-weight:900; }
    .family { background:#eaf3ff; color:#0f1f55; padding:10px 16px; font-size:15px; font-weight:900; border-top:1px solid var(--line); }
    .model-header { background:var(--primary); color:white; padding:13px 16px; font-size:20px; font-weight:900; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:12px 14px; border-top:1px solid #eef2f7; text-align:left; font-size:13px; vertical-align:top; }
    th { background:#f8fafc; color:#475569; font-size:11px; letter-spacing:.05em; text-transform:uppercase; }
    .sku { font-weight:900; color:var(--primary); white-space:nowrap; }
    .name { font-weight:800; }
    .product-cell { display:flex; align-items:center; gap:10px; min-width:260px; }
    .product-thumb { width:48px; height:48px; flex:0 0 48px; object-fit:contain; border:1px solid #e2e8f0; border-radius:10px; background:#fff; }
    .product-name-wrap { position:relative; display:inline-block; }
    .product-image-link { color:inherit; text-decoration:none; border-bottom:1px dashed var(--primary); cursor:zoom-in; }
    .product-image-link:hover, .product-image-link:focus { color:var(--primary); border-bottom-style:solid; outline:none; }
    .product-image-hover { position:fixed; z-index:9999; top:110px; right:24px; width:min(380px,calc(100vw - 48px)); height:min(380px,calc(100vh - 150px)); display:none; align-items:center; justify-content:center; padding:12px; border:1px solid #cbd5e1; border-radius:20px; background:white; box-shadow:0 28px 80px rgba(15,23,42,.32); pointer-events:none; overflow:hidden; }
    .product-name-wrap:hover .product-image-hover, .product-name-wrap:focus-within .product-image-hover { display:flex; }
    .product-image-hover img { width:100%; height:100%; object-fit:contain; border-radius:12px; background:#f8fafc; }
    .muted { color:var(--muted); font-size:12px; margin-top:4px; }
    .price { font-weight:900; white-space:nowrap; }
    .stock-ok { color:var(--ok); font-weight:900; }
    .mobile-card { display:none; }
    .empty { background:white; border:1px solid var(--line); border-radius:22px; padding:26px; text-align:center; color:var(--muted); }
    .footer-note { color:#64748b; font-size:12px; margin-top:20px; text-align:center; }
    @media (max-width: 900px) {
      .controls { position:relative; top:auto; grid-template-columns:1fr; }
      .stats { grid-template-columns:1fr 1fr; }
      table { display:none; }
      .main-logo { max-height:44px; max-width:190px; }
      h1 { font-size:26px; }
      .mobile-card { display:block; padding:14px 16px; border-top:1px solid #eef2f7; }
      .mobile-card .top { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
      .mobile-card .prices { margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .mobile-card .mini { background:#f8fafc; border-radius:14px; padding:10px; }
      .mobile-card .mini span { display:block; color:var(--muted); font-size:11px; font-weight:800; }
      .mobile-card .mini strong { display:block; margin-top:4px; }
      .product-thumb { width:42px; height:42px; flex-basis:42px; }
      .product-image-hover { display:none !important; }
    }
    @media (hover:none) { .product-image-hover { display:none !important; } }
  </style>
</head>
<body>
  <header class="hero">
    <div class="topline">
      <div>${logo || `<strong>${meta.business}</strong>`}</div>
      <strong>${isForte ? "Líderes en Motopartes en Argentina" : "Lista B2B López Hnos"}</strong>
    </div>
    <div class="visual-hero" ${bannerStyle}>
      <div class="hero-title">
        <div>
          <h1>Lista de precios ${meta.titleBase}</h1>
          <p>${ivaMessage} Sujeto a disponibilidad y actualización comercial.</p>
        </div>
        <div class="stamp">Generada: ${generatedAt}<br/>Tipo: ${meta.listTypeLabel}<br/>Stock: disponible / consultar</div>
      </div>
    </div>
  </header>

  ${brandLogos ? `<section class="brand-strip">${brandLogos}</section>` : ""}

  <main class="wrap">
    <section class="controls">
      <input id="search" placeholder="Buscar SKU, producto, marca o modelo..." />
      ${isBicycles ? `
        <select id="brand"><option value="">Todas las marcas</option></select>
        <select id="model"><option value="">Todos los modelos</option></select>
      ` : `
        <select id="category"><option value="">Todas las categorías</option></select>
        <select id="subcategory"><option value="">Todas las subcategorías</option></select>
        <select id="family"><option value="">Todas las familias</option></select>
      `}
    </section>
    <div id="content"></div>
    <div class="footer-note">Lista referencial. ${ivaMessage} Stock sujeto a disponibilidad al momento de generar el pedido.</div>
  </main>
  <script>
    const PRODUCTS = ${payload};
    const IS_BICYCLES = ${isBicycles ? "true" : "false"};
    const fmt = new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 });
    const state = { search:'', category:'', subcategory:'', family:'', brand:'', model:'' };
    const $ = (id) => document.getElementById(id);
    function norm(v){ return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
    function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
    function safeImageUrl(v){ try { const u=new URL(String(v || ''), window.location.href); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
    function productName(p){
      const name=esc(p.name || 'Sin nombre');
      const image=safeImageUrl(p.imageUrl);
      if(!image) return '<span class="name">'+name+'</span>';
      const imageEsc=esc(image);
      return '<span class="product-cell"><img class="product-thumb" src="'+imageEsc+'" alt="" loading="lazy"><span class="product-name-wrap"><a class="name product-image-link" href="'+imageEsc+'" target="_blank" rel="noopener noreferrer" title="Abrir imagen del producto">'+name+'</a><span class="product-image-hover" aria-hidden="true"><img src="'+imageEsc+'" alt="Vista previa de '+name+'" loading="lazy"></span></span></span>';
    }
    function optionRowsFor(field){
      return PRODUCTS.filter(p=>{
        const hay = norm([p.sku,p.name,p.brand,p.model,p.category,p.subcategory,p.family].join(' '));
        if(state.search && !hay.includes(norm(state.search))) return false;
        if(IS_BICYCLES){
          if(field !== 'brand' && state.brand && p.brand !== state.brand) return false;
          return true;
        }
        if(field !== 'category' && state.category && p.category !== state.category) return false;
        if(field !== 'subcategory' && state.subcategory && p.subcategory !== state.subcategory) return false;
        if(field !== 'family' && state.family && p.family !== state.family) return false;
        return true;
      });
    }
    function fillSelect(id, values){
      const el=$(id); if(!el) return;
      const current = el.value;
      const first = el.options[0]?.textContent || 'Todos';
      el.innerHTML = '';
      const blank=document.createElement('option'); blank.value=''; blank.textContent=first; el.appendChild(blank);
      values.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o); });
      if(values.includes(current)){ el.value = current; } else { el.value = ''; state[id] = ''; }
    }
    function refreshOptions(){
      fillSelect('category', [...new Set(optionRowsFor('category').map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')));
      fillSelect('subcategory', [...new Set(optionRowsFor('subcategory').map(p=>p.subcategory).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')));
      fillSelect('family', [...new Set(optionRowsFor('family').map(p=>p.family).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')));
      fillSelect('brand', [...new Set(optionRowsFor('brand').map(p=>p.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')));
      fillSelect('model', [...new Set(optionRowsFor('model').map(p=>p.model).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')));
    }
    ['search','category','subcategory','family','brand','model'].forEach(id=>{ const el=$(id); if(!el) return; const handler=e=>{ state[id]=e.target.value; if(id==='category'){ state.subcategory=''; state.family=''; } if(id==='subcategory'){ state.family=''; } if(id==='brand'){ state.model=''; } refreshOptions(); render(); }; el.addEventListener('input', handler); el.addEventListener('change', handler); });
    refreshOptions();
    function getStock(p){ return Number(p.availableStock ?? p.stock ?? 0) || 0; }
    function filtered(){
      return PRODUCTS.filter(p=>{
        const hay = norm([p.sku,p.name,p.brand,p.model,p.category,p.subcategory,p.family].join(' '));
        if(state.search && !hay.includes(norm(state.search))) return false;
        if(!IS_BICYCLES){
          if(state.category && p.category !== state.category) return false;
          if(state.subcategory && p.subcategory !== state.subcategory) return false;
          if(state.family && p.family !== state.family) return false;
        }
        if(state.brand && p.brand !== state.brand) return false;
        if(state.model && p.model !== state.model) return false;
        return true;
      });
    }
    function stockText(p){ return getStock(p)>0 ? 'Disponible' : 'Consultar'; }
    function renderTable(container, items){
      const table = document.createElement('table');
      table.innerHTML='<thead><tr><th>SKU</th><th>Artículo</th><th>Marca/Modelo</th><th>Disponibilidad</th><th>Lista</th><th>${meta.listTypeLabel}</th><th>Contado 7 días</th></tr></thead><tbody></tbody>';
      const tbody=table.querySelector('tbody');
      items.forEach(p=>{
        const tr=document.createElement('tr');
        tr.innerHTML='<td class="sku">'+esc(p.sku)+'</td><td>'+productName(p)+'<div class="muted">'+esc([p.category,p.subcategory,p.family].filter(Boolean).join(' › '))+'</div></td><td>'+[p.brand,p.model].filter(Boolean).map(esc).join('<br/>')+'</td><td class="stock-ok">'+stockText(p)+'</td><td>'+fmt.format(p.priceBase||0)+'</td><td class="price">'+fmt.format(p.priceDistributor||0)+'</td><td class="price">'+fmt.format(p.priceCash||0)+'</td>';
        tbody.appendChild(tr);
        const card=document.createElement('article');
        card.className='mobile-card';
        card.innerHTML='<div class="top"><div><div class="sku">'+esc(p.sku)+'</div>'+productName(p)+'<div class="muted">'+esc([p.brand,p.model].filter(Boolean).join(' · '))+'</div></div><div class="stock-ok">'+stockText(p)+'</div></div><div class="muted">'+esc([p.category,p.subcategory,p.family].filter(Boolean).join(' › '))+'</div><div class="prices"><div class="mini"><span>${meta.listTypeLabel}</span><strong>'+fmt.format(p.priceDistributor||0)+'</strong></div><div class="mini"><span>Contado 7 días</span><strong>'+fmt.format(p.priceCash||0)+'</strong></div></div>';
        container.appendChild(card);
      });
      container.appendChild(table);
    }
    function render(){
      const rows=filtered();
      const prices=rows.map(p=>Number(p.priceDistributor)||0).filter(Boolean);
      const content=$('content'); content.innerHTML='';
      if(!rows.length){ content.innerHTML='<div class="empty">No hay productos para los filtros seleccionados.</div>'; return; }
      if(IS_BICYCLES){
        const groups=new Map();
        rows.forEach(p=>{ const key=[p.brand || 'Sin marca', p.model || 'Sin modelo'].join('|||'); if(!groups.has(key)) groups.set(key,{brand:p.brand || 'Sin marca', model:p.model || 'Sin modelo', items:[]}); groups.get(key).items.push(p); });
        groups.forEach(g=>{ const section=document.createElement('section'); section.className='group'; section.innerHTML='<div class="category">'+esc(g.brand)+'</div><div class="model-header">Modelo: '+esc(g.model)+'</div>'; content.appendChild(section); renderTable(section,g.items); });
        return;
      }
      const groups=new Map();
      rows.forEach(p=>{ const key=[p.category,p.subcategory,p.family].join('|||'); if(!groups.has(key)) groups.set(key,{category:p.category,subcategory:p.subcategory,family:p.family,items:[]}); groups.get(key).items.push(p); });
      let currentCategory='', currentSub='', openGroup=null;
      groups.forEach(g=>{
        if(g.category !== currentCategory || g.subcategory !== currentSub){ openGroup=document.createElement('section'); openGroup.className='group'; openGroup.innerHTML='<div class="category">'+esc(g.category)+'</div><div class="subcategory">'+esc(g.subcategory)+'</div>'; content.appendChild(openGroup); currentCategory=g.category; currentSub=g.subcategory; }
        const family=document.createElement('div'); family.className='family'; family.textContent=g.family; openGroup.appendChild(family); renderTable(openGroup,g.items);
      });
    }
    render();
  </script>
</body>
</html>`;
}

module.exports = function priceListsRoutes({ app, queryOdoo, queryOdooCached }) {
  const odooQuery = queryOdooCached || queryOdoo;
  app.get("/api/price-lists/config", (req, res) => {
    const config = getPriceConfig();
    res.json({
      ...config,
      cashDiscountPct: Math.round(config.cashDiscount * 100),
      ivaRatePct: Math.round(config.ivaRate * 100),
      listsPct: Object.fromEntries(
        Object.entries(config.lists || {}).map(([baseKey, values]) => [
          baseKey,
          {
            distribuidor: Math.round(Number(values.distribuidor || 0) * 100),
            mostrador: Math.round(Number(values.mostrador || 0) * 100),
          },
        ])
      ),
    });
  });

  app.put("/api/price-lists/config", (req, res) => {
    const role = String(req.body?.role || req.query.role || "");
    if (role !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede modificar la configuración de precios." });
    }

    const current = getPriceConfig();
    const incoming = req.body?.config || {};
    const next = mergeConfig({
      ...current,
      ...incoming,
      lists: {
        ...(current.lists || {}),
        ...(incoming.lists || {}),
      },
    });
    const saved = savePriceConfig(next);
    res.json({ ok: true, config: saved });
  });

  app.get("/api/price-lists", async (req, res) => {
    try {
      const lists = await Promise.all(
        Object.values(LIST_META).map(async (meta) => {
          const { products, source, warning } = await getProducts({
            queryOdoo: odooQuery,
            meta,
            query: { stockOnly: "true", limit: "1" },
          });

          return {
            ...meta,
            summary: getSummary(products),
            generatedAt: new Date().toISOString(),
            source,
            warning,
          };
        })
      );

      res.json(lists);
    } catch (error) {
      console.error("ERROR PRICE LISTS:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/price-lists/:key", async (req, res) => {
    const meta = LIST_META[req.params.key];

    if (!meta) {
      return res.status(404).json({ error: "Lista no encontrada" });
    }

    const { products, source, warning } = await getProducts({
      queryOdoo: odooQuery,
      meta,
      query: req.query,
    });

    const filtered = source === "odoo" ? products : filterProducts(products, req.query, meta);
    const limit = Math.min(Number(req.query.limit || 800), 10000);

    res.json({
      meta,
      generatedAt: new Date().toISOString(),
      source,
      warning,
      summary: getSummary(filtered),
      facets: getFacets(filtered.length ? filtered : products),
      items: filtered.slice(0, limit),
      total: filtered.length,
      limit,
    });
  });

  app.get("/api/price-lists/:key/download-html", async (req, res) => {
    const meta = LIST_META[req.params.key];

    if (!meta) {
      return res.status(404).send("Lista no encontrada");
    }

    const query = {
      ...req.query,
      stockOnly: req.query.stockOnly ?? "true",
      limit: req.query.limit || "10000",
    };

    const { products, source } = await getProducts({ queryOdoo: odooQuery, meta, query });
    const filtered = source === "odoo" ? products : filterProducts(products, query, meta);

    const html = buildHtml({
      meta,
      products: filtered,
      stockMode: "status",
      filters: query,
      source,
      config: getPriceConfig(),
    });

    const filename = `${meta.key}-${new Date()
      .toISOString()
      .slice(0, 10)}.html`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    res.send(html);
  });
};

// Utilidades compartidas con el modulo de Catalogos Comerciales.
module.exports.helpers = {
  ASSET_URLS,
  BASE_LISTS,
  LIST_META,
  getPriceConfig,
  getProducts,
  filterProducts,
  getFacets,
  getSummary,
  productImageUrl,
  assetToDataUri,
  money,
  normalizeText,
};
