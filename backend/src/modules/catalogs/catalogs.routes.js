const fs = require("fs");
const path = require("path");
const multer = require("multer");
const priceListsModule = require("../price-lists/price-lists.routes");

const {
  BASE_LISTS,
  LIST_META,
  getProducts,
  filterProducts,
  getFacets,
  getSummary,
  assetToDataUri,
} = priceListsModule.helpers;

const ACCESS_ROLES = new Set(["admin", "supervisor", "jefe", "gerente"]);
const MANAGE_ROLES = new Set(["admin", "supervisor", "jefe"]);

const DEFAULT_CONFIG = {
  title: "",
  subtitle: "Catálogo comercial actualizado",
  campaignText: "",
  validityText: "",
  coverImageUrl: "",
  bannerImageUrl: "",
  logoUrl: "",
  primaryColor: "#0f172a",
  secondaryColor: "#2563eb",
  pageBackgroundColor: "#eef2f7",
  cardBackgroundColor: "#ffffff",
  textColor: "#0f172a",
  printOrientation: "portrait",
  cardStyle: "modern",
  showPrices: false,
  showCashPrice: false,
  showStock: true,
  stockOnly: true,
  publishedOnly: true,
  showCategoryBanner: true,
  showSubcategoryBanner: true,
  footerText: "Precios y disponibilidad sujetos a actualización.",
};

function roleFrom(req) {
  return String(req.body?.role || req.query?.role || "").toLowerCase();
}

function requireAccess(req, res) {
  if (!ACCESS_ROLES.has(roleFrom(req))) {
    res.status(403).json({ error: "No tiene permisos para utilizar Catálogos Comerciales." });
    return false;
  }
  return true;
}

function requireManage(req, res) {
  if (!MANAGE_ROLES.has(roleFrom(req))) {
    res.status(403).json({ error: "Solo Supervisor, Jefe o Administrador pueden modificar el diseño del catálogo." });
    return false;
  }
  return true;
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["true", "1", "yes", "si", "sí"].includes(String(value).toLowerCase());
}

function cleanText(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function safeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function safeStyle(value) {
  return ["modern", "classic", "compact"].includes(value) ? value : "modern";
}

function safeOrientation(value) {
  return value === "landscape" ? "landscape" : "portrait";
}

function baseMeta(baseKey) {
  return BASE_LISTS.find((item) => item.baseKey === baseKey) || null;
}

function defaultConfigFor(baseKey) {
  const meta = baseMeta(baseKey);
  const isForte = meta?.theme === "forte";
  return {
    ...DEFAULT_CONFIG,
    title: `Catálogo ${meta?.titleBase || baseKey}`,
    subtitle: `Selección comercial de ${meta?.titleBase || baseKey}`,
    coverImageUrl: meta?.banner || "",
    bannerImageUrl: meta?.banner || "",
    logoUrl: meta?.logo || "",
    primaryColor: isForte ? "#171717" : "#071a52",
    secondaryColor: isForte ? "#d41422" : "#2563eb",
  };
}

function rowToConfig(row, baseKey) {
  const defaults = defaultConfigFor(baseKey);
  if (!row) return defaults;
  return {
    ...defaults,
    title: row.title || defaults.title,
    subtitle: row.subtitle || "",
    campaignText: row.campaign_text || "",
    validityText: row.validity_text || "",
    coverImageUrl: row.cover_image_url || defaults.coverImageUrl,
    bannerImageUrl: row.banner_image_url || defaults.bannerImageUrl,
    logoUrl: row.logo_url || defaults.logoUrl,
    primaryColor: row.primary_color || defaults.primaryColor,
    secondaryColor: row.secondary_color || defaults.secondaryColor,
    pageBackgroundColor: row.page_background_color || defaults.pageBackgroundColor,
    cardBackgroundColor: row.card_background_color || defaults.cardBackgroundColor,
    textColor: row.text_color || defaults.textColor,
    printOrientation: row.print_orientation || defaults.printOrientation,
    cardStyle: row.card_style || defaults.cardStyle,
    showPrices: Boolean(row.show_prices),
    showCashPrice: Boolean(row.show_cash_price),
    showStock: row.show_stock === null || row.show_stock === undefined ? defaults.showStock : Boolean(row.show_stock),
    stockOnly: row.stock_only === null || row.stock_only === undefined ? defaults.stockOnly : Boolean(row.stock_only),
    publishedOnly: row.published_only === null || row.published_only === undefined ? defaults.publishedOnly : Boolean(row.published_only),
    showCategoryBanner: row.show_category_banner === null || row.show_category_banner === undefined ? defaults.showCategoryBanner : Boolean(row.show_category_banner),
    showSubcategoryBanner: row.show_subcategory_banner === null || row.show_subcategory_banner === undefined ? defaults.showSubcategoryBanner : Boolean(row.show_subcategory_banner),
    footerText: row.footer_text || defaults.footerText,
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at || "",
  };
}

function getConfig(db, baseKey) {
  const row = db.prepare("SELECT * FROM catalog_visual_configs WHERE base_key = ?").get(baseKey);
  return rowToConfig(row, baseKey);
}

function saveConfig(db, baseKey, incoming, userName) {
  const current = getConfig(db, baseKey);
  const next = {
    ...current,
    title: cleanText(incoming.title ?? current.title, 120),
    subtitle: cleanText(incoming.subtitle ?? current.subtitle, 240),
    campaignText: cleanText(incoming.campaignText ?? current.campaignText, 1000),
    validityText: cleanText(incoming.validityText ?? current.validityText, 160),
    coverImageUrl: cleanText(incoming.coverImageUrl ?? current.coverImageUrl, 1000),
    bannerImageUrl: cleanText(incoming.bannerImageUrl ?? current.bannerImageUrl, 1000),
    logoUrl: cleanText(incoming.logoUrl ?? current.logoUrl, 1000),
    primaryColor: safeColor(incoming.primaryColor, current.primaryColor),
    secondaryColor: safeColor(incoming.secondaryColor, current.secondaryColor),
    pageBackgroundColor: safeColor(incoming.pageBackgroundColor, current.pageBackgroundColor),
    cardBackgroundColor: safeColor(incoming.cardBackgroundColor, current.cardBackgroundColor),
    textColor: safeColor(incoming.textColor, current.textColor),
    printOrientation: safeOrientation(incoming.printOrientation || current.printOrientation),
    cardStyle: safeStyle(incoming.cardStyle || current.cardStyle),
    showPrices: boolValue(incoming.showPrices, current.showPrices),
    showCashPrice: boolValue(incoming.showCashPrice, current.showCashPrice),
    showStock: boolValue(incoming.showStock, current.showStock),
    stockOnly: boolValue(incoming.stockOnly, current.stockOnly),
    publishedOnly: boolValue(incoming.publishedOnly, current.publishedOnly),
    showCategoryBanner: boolValue(incoming.showCategoryBanner, current.showCategoryBanner),
    showSubcategoryBanner: boolValue(incoming.showSubcategoryBanner, current.showSubcategoryBanner),
    footerText: cleanText(incoming.footerText ?? current.footerText, 500),
  };

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO catalog_visual_configs (
      base_key, title, subtitle, campaign_text, validity_text,
      cover_image_url, banner_image_url, logo_url,
      primary_color, secondary_color, page_background_color,
      card_background_color, text_color, print_orientation, card_style,
      show_prices, show_cash_price, show_stock, stock_only, published_only,
      show_category_banner, show_subcategory_banner,
      footer_text, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(base_key) DO UPDATE SET
      title = excluded.title,
      subtitle = excluded.subtitle,
      campaign_text = excluded.campaign_text,
      validity_text = excluded.validity_text,
      cover_image_url = excluded.cover_image_url,
      banner_image_url = excluded.banner_image_url,
      logo_url = excluded.logo_url,
      primary_color = excluded.primary_color,
      secondary_color = excluded.secondary_color,
      page_background_color = excluded.page_background_color,
      card_background_color = excluded.card_background_color,
      text_color = excluded.text_color,
      print_orientation = excluded.print_orientation,
      card_style = excluded.card_style,
      show_prices = excluded.show_prices,
      show_cash_price = excluded.show_cash_price,
      show_stock = excluded.show_stock,
      stock_only = excluded.stock_only,
      published_only = excluded.published_only,
      show_category_banner = excluded.show_category_banner,
      show_subcategory_banner = excluded.show_subcategory_banner,
      footer_text = excluded.footer_text,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(
    baseKey,
    next.title,
    next.subtitle,
    next.campaignText,
    next.validityText,
    next.coverImageUrl,
    next.bannerImageUrl,
    next.logoUrl,
    next.primaryColor,
    next.secondaryColor,
    next.pageBackgroundColor,
    next.cardBackgroundColor,
    next.textColor,
    next.printOrientation,
    next.cardStyle,
    next.showPrices ? 1 : 0,
    next.showCashPrice ? 1 : 0,
    next.showStock ? 1 : 0,
    next.stockOnly ? 1 : 0,
    next.publishedOnly ? 1 : 0,
    next.showCategoryBanner ? 1 : 0,
    next.showSubcategoryBanner ? 1 : 0,
    next.footerText,
    cleanText(userName, 120),
    now
  );

  return getConfig(db, baseKey);
}

function getSubcategoryBanners(db, baseKey) {
  const rows = db.prepare(`
    SELECT subcategory, image_url, updated_by, updated_at
    FROM catalog_subcategory_banners
    WHERE base_key = ?
    ORDER BY subcategory
  `).all(baseKey);
  return Object.fromEntries(rows.map((row) => [row.subcategory, {
    imageUrl: row.image_url,
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at || "",
  }]));
}

function saveSubcategoryBanner(db, baseKey, subcategory, imageUrl, userName) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO catalog_subcategory_banners (base_key, subcategory, image_url, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(base_key, subcategory) DO UPDATE SET
      image_url = excluded.image_url,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(baseKey, cleanText(subcategory, 240), cleanText(imageUrl, 1000), cleanText(userName, 120), now);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value) {
  return Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function slug(value) {
  return String(value || "catalogo")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "catalogo";
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseSelection(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  const raw = String(value).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return raw.split("||").map((item) => item.trim()).filter(Boolean);
}

function localAssetToDataUri(url, uploadsDir) {
  if (!url) return "";
  if (url.startsWith("asset://")) return assetToDataUri(url);
  if (!url.startsWith("/uploads/")) return url;

  const relative = url.replace(/^\/uploads\//, "");
  const filePath = path.join(uploadsDir, relative);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(path.normalize(uploadsDir))) return "";

  try {
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
  } catch (error) {
    console.warn("No se pudo incluir recurso visual del catálogo", error.message);
    return "";
  }
}

function absoluteAssetUrl(url, publicApiUrl) {
  if (!url) return "";
  if (url.startsWith("asset://")) return assetToDataUri(url);
  if (url.startsWith("/uploads/")) return `${publicApiUrl}${url}`;
  return url;
}

function matchesSelection(value, selected) {
  if (!selected.length) return true;
  const normalized = normalizeText(value);
  return selected.some((item) => normalizeText(item) === normalized);
}

function applyCatalogFilters(products, query, meta, config) {
  const baseFiltered = filterProducts(products, {
    ...query,
    category: "",
    subcategory: "",
    family: "",
    brand: "",
    model: "",
    stockOnly: query.stockOnly ?? String(config.stockOnly),
  }, meta);

  const categories = parseSelection(query.category);
  const brands = parseSelection(query.brand);
  const subcategories = parseSelection(query.subcategory);
  const families = parseSelection(query.family);
  const publishedOnly = boolValue(query.publishedOnly, config.publishedOnly);

  return baseFiltered.filter((item) => {
    if (publishedOnly && !item.websitePublished) return false;
    if (!matchesSelection(item.category, categories)) return false;
    if (!matchesSelection(item.brand, brands)) return false;
    if (!matchesSelection(item.subcategory, subcategories)) return false;
    if (!matchesSelection(item.family, families)) return false;
    return true;
  });
}

function sourceQueryForCatalog(query, limit = "10000") {
  return {
    ...query,
    category: "",
    subcategory: "",
    family: "",
    brand: "",
    model: "",
    limit,
  };
}

function catalogGrouping(meta) {
  if (meta.layout === "bicycles") {
    return { field: "brand", label: "Marca", pluralLabel: "Marcas", emptyLabel: "Sin marca" };
  }
  return { field: "category", label: "Categoría", pluralLabel: "Categorías", emptyLabel: "Sin categoría" };
}

function groupProducts(products, meta) {
  const grouping = catalogGrouping(meta);
  const groups = new Map();

  products.forEach((product) => {
    const label = product[grouping.field] || grouping.emptyLabel;
    if (!groups.has(label)) groups.set(label, { label, products: [] });
    groups.get(label).products.push(product);
  });

  return Array.from(groups.values()).sort((a, b) => String(a.label).localeCompare(String(b.label), "es"));
}

function subgroupProducts(products) {
  const groups = new Map();
  products.forEach((product) => {
    const label = product.subcategory || "General";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(product);
  });
  return Array.from(groups.entries())
    .map(([label, rows]) => ({ label, products: rows }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), "es"));
}

function imageCandidates(product) {
  const original = String(product.imageUrl || "").trim();
  if (!original) return [];
  return Array.from(new Set([
    original,
    original.replace("/image_1024/", "/image_512/"),
    original.replace("/image_1024/", "/image_1920/"),
  ].filter(Boolean)));
}

function configForResponse(db, baseKey, publicApiUrl) {
  const config = getConfig(db, baseKey);
  const rawBanners = getSubcategoryBanners(db, baseKey);
  const subcategoryBanners = Object.fromEntries(Object.entries(rawBanners).map(([subcategory, item]) => [subcategory, {
    ...item,
    previewUrl: absoluteAssetUrl(item.imageUrl, publicApiUrl),
  }]));
  return {
    ...config,
    coverPreviewUrl: absoluteAssetUrl(config.coverImageUrl, publicApiUrl),
    bannerPreviewUrl: absoluteAssetUrl(config.bannerImageUrl, publicApiUrl),
    logoPreviewUrl: absoluteAssetUrl(config.logoUrl, publicApiUrl),
    subcategoryBanners,
  };
}

function buildCatalogHtml({ meta, products, config, source, uploadsDir }) {
  const generatedAt = new Date().toLocaleString("es-AR");
  const cover = localAssetToDataUri(config.coverImageUrl, uploadsDir);
  const banner = localAssetToDataUri(config.bannerImageUrl, uploadsDir);
  const logo = localAssetToDataUri(config.logoUrl, uploadsDir);
  const grouping = catalogGrouping(meta);
  const groups = groupProducts(products, meta);
  const showPrices = Boolean(config.showPrices);
  const showCashPrice = showPrices && Boolean(config.showCashPrice);
  const showStock = Boolean(config.showStock);
  const showCategoryBanner = Boolean(config.showCategoryBanner);
  const showSubcategoryBanner = Boolean(config.showSubcategoryBanner);
  const orientation = safeOrientation(config.printOrientation);
  const pageHeight = orientation === "landscape" ? "194mm" : "281mm";
  const printColumns = orientation === "landscape" ? 4 : 3;
  const rawSubcategoryBanners = config.subcategoryBanners || {};
  const embeddedSubcategoryBanners = Object.fromEntries(Object.entries(rawSubcategoryBanners).map(([key, item]) => [
    key,
    localAssetToDataUri(item.imageUrl || item, uploadsDir),
  ]));

  const groupNav = groups
    .map((group, index) => `<button type="button" class="group-link${index === 0 ? " active" : ""}" data-target="group-${index}" data-label="${escapeHtml(group.label)}"><span>${escapeHtml(group.label)}</span><small>${group.products.length}</small></button>`)
    .join("");

  const firstGroupLabel = groups[0]?.label || grouping.label;
  const sidebarVisual = showCategoryBanner
    ? `<div class="sidebar-visual">${banner ? `<img class="sidebar-visual-image" src="${banner}" alt="Banner de categoría" />` : ""}<div class="sidebar-visual-overlay"></div><div class="sidebar-visual-content"><strong id="sidebar-category-title">${escapeHtml(firstGroupLabel)}</strong><span>${escapeHtml(grouping.label)}</span></div></div>`
    : "";

  function renderProductCard(product) {
    const productSearch = [
      product.sku,
      product.name,
      product.brand,
      product.model,
      product.category,
      product.subcategory,
      product.family,
    ].filter(Boolean).join(" ").toLowerCase();

    const candidates = imageCandidates(product);
    const candidatesPayload = escapeHtml(JSON.stringify(candidates));
    const image = candidates.length
      ? `<a class="product-image is-loading" href="${escapeHtml(candidates[0])}" target="_blank" rel="noopener noreferrer"><img data-candidates="${candidatesPayload}" alt="${escapeHtml(product.name)}" decoding="async" referrerpolicy="no-referrer" /></a>`
      : `<div class="product-image image-error"><span>Sin imagen</span></div>`;

    const priceBlock = showPrices
      ? `<div class="price-block"><span>${escapeHtml(meta.listTypeLabel)}</span><strong>${money(product.priceDistributor)}</strong>${showCashPrice ? `<small>Contado: ${money(product.priceCash)}</small>` : ""}</div>`
      : "";

    const stockBlock = showStock
      ? `<span class="stock ${Number(product.availableStock || product.stock || 0) > 0 ? "ok" : "ask"}">${Number(product.availableStock || product.stock || 0) > 0 ? "Disponible" : "Consultar"}</span>`
      : "";

    return `<article class="product-card" data-search="${escapeHtml(productSearch)}">
      ${image}
      <div class="product-info">
        <div class="product-top"><span class="sku">${escapeHtml(product.sku)}</span>${stockBlock}</div>
        <h3>${candidates.length ? `<a href="${escapeHtml(candidates[0])}" target="_blank" rel="noopener noreferrer">${escapeHtml(product.name)}</a>` : escapeHtml(product.name)}</h3>
        <p class="brand-model">${escapeHtml([product.brand, product.model].filter(Boolean).join(" · "))}</p>
        <p class="path">${escapeHtml([product.category, product.subcategory, product.family].filter(Boolean).join(" › "))}</p>
        ${priceBlock}
      </div>
    </article>`;
  }

  function renderBanner({ image, title, detail, className }) {
    return `<div class="${className}">
      ${image ? `<img class="section-banner-image" src="${image}" alt="${escapeHtml(title)}" />` : ""}
      <div class="section-banner-overlay"></div>
      <div class="section-banner-content"><h2>${escapeHtml(title)}</h2>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>
    </div>`;
  }

  const sections = groups.map((group, groupIndex) => {
    const subgroups = subgroupProducts(group.products);
    const subgroupSections = subgroups.map((subgroup, subgroupIndex) => {
      const customBanner = embeddedSubcategoryBanners[subgroup.label] || banner;
      const cards = subgroup.products.map(renderProductCard).join("");
      const subsectionHeader = showSubcategoryBanner
        ? renderBanner({
            image: customBanner,
            title: subgroup.label,
            detail: `${subgroup.products.length} productos`,
            className: "subcategory-banner",
          })
        : `<div class="subcategory-heading"><h2>${escapeHtml(subgroup.label)}</h2><p>${subgroup.products.length} productos</p></div>`;
      return `<section class="subcategory-section" id="group-${groupIndex}-sub-${subgroupIndex}">
        ${subsectionHeader}
        <div class="product-grid">${cards}</div>
      </section>`;
    }).join("");

    return `<section class="category-section" id="group-${groupIndex}" data-group="${escapeHtml(group.label.toLowerCase())}" data-label="${escapeHtml(group.label)}">
      <div class="print-category-heading"><h1>${escapeHtml(group.label)}</h1><p>${subgroups.length} subcategorías · ${group.products.length} productos</p></div>
      ${subgroupSections}
    </section>`;
  }).join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(config.title)}</title>
  <style>
    @page{size:A4 ${orientation};margin:8mm}
    :root{--primary:${config.primaryColor};--secondary:${config.secondaryColor};--ink:${config.textColor};--muted:#64748b;--line:#dbe3ec;--paper:${config.cardBackgroundColor};--bg:${config.pageBackgroundColor};--toolbar-h:76px}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(145deg,var(--bg),color-mix(in srgb,var(--secondary) 8%,var(--bg)));color:var(--ink);font-family:Inter,Arial,sans-serif;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.cover{min-height:100vh;display:flex;position:relative;overflow:hidden;background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff}.cover-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.08)}.cover-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(2,6,23,.94),rgba(2,6,23,.38))}.cover-content{position:relative;z-index:2;max-width:760px;margin:auto 7vw;padding:60px 0}.cover-logo{max-width:290px;max-height:92px;object-fit:contain;margin-bottom:42px}.cover-eyebrow{font-size:14px;letter-spacing:.28em;font-weight:900;color:#dbeafe}.cover h1{font-size:clamp(44px,7vw,96px);line-height:.96;margin:14px 0 22px;letter-spacing:-.055em}.cover h1:after{content:"";display:block;width:110px;height:8px;background:var(--secondary);border-radius:99px;margin-top:28px}.cover-subtitle{font-size:clamp(19px,2vw,28px);line-height:1.4;margin:0 0 22px;max-width:650px}.cover-campaign{font-size:17px;line-height:1.55;color:#e2e8f0;max-width:620px}.cover-validity{display:inline-flex;margin-top:26px;padding:10px 16px;border:1px solid rgba(255,255,255,.34);border-radius:999px;background:rgba(255,255,255,.1);font-weight:800}.toolbar{position:sticky;top:0;z-index:30;background:rgba(255,255,255,.96);backdrop-filter:blur(14px);border-bottom:1px solid var(--line);box-shadow:0 10px 30px rgba(15,23,42,.07)}.toolbar-inner{max-width:1480px;margin:auto;padding:14px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}.toolbar strong{margin-right:auto}.toolbar input{min-width:260px;flex:1;max-width:520px;border:1px solid var(--line);border-radius:12px;padding:11px 14px;font-size:15px}.toolbar button{border:0;border-radius:12px;padding:11px 15px;background:var(--primary);color:#fff;font-weight:800;cursor:pointer;min-width:210px}.toolbar button:disabled{opacity:.7;cursor:wait}.catalog-layout{max-width:1480px;margin:0 auto;display:grid;grid-template-columns:250px minmax(0,1fr);gap:24px;padding:24px}.catalog-sidebar{position:relative}.sidebar-card{position:sticky;top:calc(var(--toolbar-h) + 20px);max-height:calc(100vh - var(--toolbar-h) - 40px);overflow:auto;border:1px solid var(--line);border-radius:18px;background:var(--paper);padding:14px;box-shadow:0 12px 32px rgba(15,23,42,.07)}.sidebar-visual{position:relative;min-height:150px;margin:-4px -4px 12px;border-radius:15px;overflow:hidden;color:#fff;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:flex-end}.sidebar-visual-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.sidebar-visual-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,23,42,.18),rgba(15,23,42,.92))}.sidebar-visual-content{position:relative;z-index:2;padding:16px;display:flex;flex-direction:column;gap:3px}.sidebar-visual-content strong{font-size:22px;line-height:1.05}.sidebar-visual-content span{font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#dbeafe}.sidebar-title{display:block;padding:5px 7px 12px;color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.group-link{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;border:0;border-radius:11px;background:transparent;padding:10px 11px;color:var(--ink);font-weight:800;text-align:left;cursor:pointer}.group-link:hover{background:color-mix(in srgb,var(--secondary) 10%,white)}.group-link.active{background:var(--primary);color:#fff}.group-link small{min-width:28px;border-radius:999px;background:#e2e8f0;color:#475569;padding:3px 7px;text-align:center}.group-link.active small{background:rgba(255,255,255,.18);color:#fff}.catalog-main{min-width:0;padding:0 0 50px}.category-section{margin-bottom:52px;scroll-margin-top:calc(var(--toolbar-h) + 18px)}.print-category-heading{display:none}.subcategory-heading{margin:18px 0 14px;padding:14px 18px;border-left:6px solid var(--secondary);border-radius:12px;background:color-mix(in srgb,var(--paper) 92%,var(--secondary) 8%)}.subcategory-heading h2{margin:0;font-size:28px;letter-spacing:-.025em}.subcategory-heading p{margin:4px 0 0;color:var(--muted);font-weight:700}.category-banner,.subcategory-banner{position:relative;overflow:hidden;display:flex;align-items:flex-end;color:#fff;background:linear-gradient(135deg,var(--primary),var(--secondary));box-shadow:0 18px 50px rgba(15,23,42,.16)}.category-banner{min-height:190px;border-radius:26px;margin-bottom:24px}.subcategory-banner{min-height:132px;border-radius:20px;margin:22px 0 16px}.section-banner-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.section-banner-overlay{position:absolute;inset:0;background:linear-gradient(90deg,rgba(15,23,42,.94),rgba(15,23,42,.35))}.section-banner-content{position:relative;z-index:2;padding:28px}.section-banner-content h2{font-size:38px;margin:6px 0 2px;letter-spacing:-.035em}.subcategory-banner .section-banner-content h2{font-size:30px}.section-banner-content p{margin:0;color:#e2e8f0}.subcategory-section{margin-bottom:30px}.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:18px}.product-card{background:var(--paper);border:1px solid var(--line);border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.06);display:flex;flex-direction:column;break-inside:avoid}.product-image{height:230px;display:flex;align-items:center;justify-content:center;position:relative;background:#fff;padding:14px;border-bottom:1px solid #edf2f7}.product-image img{width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .2s}.product-image.loaded img{opacity:1}.product-image.is-loading:after{content:"Cargando imagen...";position:absolute;color:#94a3b8;font-size:12px}.product-image.image-error{background:#f8fafc;color:#94a3b8;text-decoration:none}.product-image.image-error img{display:none}.product-image.image-error:after{content:"Imagen no disponible";font-size:13px}.product-info{padding:17px;display:flex;flex-direction:column;flex:1}.product-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.sku{font-size:12px;font-weight:900;color:var(--secondary);letter-spacing:.04em}.stock{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px}.stock.ok{background:#dcfce7;color:#166534}.stock.ask{background:#fef3c7;color:#92400e}.product-card h3{font-size:17px;line-height:1.25;margin:12px 0 7px}.product-card h3 a{color:inherit;text-decoration:none}.brand-model{font-weight:800;color:#334155;margin:0 0 8px;font-size:13px}.path{color:var(--muted);font-size:12px;line-height:1.45;margin:0 0 14px}.price-block{margin-top:auto;border-top:1px solid #edf2f7;padding-top:13px;display:grid;gap:3px}.price-block span{font-size:11px;color:var(--muted);font-weight:800;text-transform:uppercase}.price-block strong{font-size:22px;color:var(--primary)}.price-block small{font-weight:800;color:#334155}.style-classic .product-card{border-radius:4px;box-shadow:none}.style-classic .subcategory-banner,.style-classic .sidebar-visual{border-radius:4px}.style-compact .product-grid{grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}.style-compact .product-image{height:175px}.style-compact .product-info{padding:12px}.footer{padding:36px 24px;text-align:center;background:var(--primary);color:#fff}.footer p{margin:4px}.footer .muted{color:#dbeafe;font-size:12px}.no-results{display:none;padding:50px;border-radius:20px;background:var(--paper);text-align:center;color:var(--muted)}.pdf-progress{position:fixed;z-index:100;inset:0;display:none;place-items:center;background:rgba(2,6,23,.72);backdrop-filter:blur(6px)}.pdf-progress.active{display:grid}.pdf-progress-card{width:min(460px,calc(100vw - 40px));padding:26px;border-radius:20px;background:#fff;box-shadow:0 30px 90px rgba(0,0,0,.3);text-align:center}.pdf-progress-card strong{display:block;font-size:20px;margin-bottom:9px}.pdf-progress-track{height:10px;margin-top:16px;border-radius:99px;background:#e2e8f0;overflow:hidden}.pdf-progress-track span{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--primary),var(--secondary));transition:width .2s}.pdf-progress-card small{display:block;margin-top:10px;color:#64748b}@media(max-width:900px){.catalog-layout{display:block;padding:16px}.catalog-sidebar{position:sticky;top:var(--toolbar-h);z-index:20;margin-bottom:18px}.sidebar-card{position:static;display:flex;gap:8px;overflow:auto;max-height:none;border-radius:14px}.sidebar-visual{display:none}.sidebar-title{display:none}.group-link{width:auto;min-width:max-content}.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.toolbar-inner{padding:10px}.toolbar input,.toolbar button{max-width:none;width:100%}.product-grid{grid-template-columns:1fr}.cover-content{margin:auto 24px}.section-banner-content h2{font-size:28px}}
    @media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html,body{background:var(--bg)!important}.toolbar,.catalog-sidebar,.pdf-progress,.screen-only{display:none!important}.catalog-layout{display:block;max-width:none;padding:0}.catalog-main{padding:0}.cover{min-height:${pageHeight};height:${pageHeight};break-after:page;page-break-after:always}.cover-content{margin:auto 14mm;padding:12mm 0}.category-section{break-before:page;page-break-before:always;margin:0}.category-section:first-child{break-before:auto;page-break-before:auto}.print-category-heading{display:block;margin:0 0 6mm;padding:6mm 7mm;border-radius:4mm;background:linear-gradient(135deg,var(--primary),var(--secondary))!important;color:#fff!important}.print-category-heading h1{margin:0;font-size:25px}.print-category-heading p{margin:2mm 0 0;color:#e2e8f0}.subcategory-heading{margin:0 0 4mm;padding:4mm 5mm;border-radius:3mm;break-after:avoid}.subcategory-heading h2{font-size:20px}.subcategory-section{break-before:page;page-break-before:always;margin:0}.subcategory-section:first-of-type{break-before:auto;page-break-before:auto}.subcategory-banner{min-height:31mm;border-radius:4mm;margin:0 0 4mm;box-shadow:none}.section-banner-content{padding:7mm}.section-banner-content h2{font-size:25px}.subcategory-banner .section-banner-content h2{font-size:22px}.product-grid{grid-template-columns:repeat(${printColumns},minmax(0,1fr));gap:3mm}.product-card{box-shadow:none;border-radius:3mm;background:var(--paper)!important}.product-image{height:${orientation === "landscape" ? "38mm" : "45mm"};padding:2mm}.product-info{padding:3mm}.product-card h3{font-size:11px}.brand-model,.path{font-size:8px}.stock,.sku{font-size:8px}.price-block strong{font-size:14px}.footer{break-before:page;page-break-before:always;min-height:${pageHeight};display:grid;place-items:center}.no-results{display:none!important}}
  </style>
</head>
<body class="style-${escapeHtml(config.cardStyle)}">
  <section class="cover">
    ${cover ? `<img class="cover-image" src="${cover}" alt="Portada" />` : ""}
    <div class="cover-shade"></div>
    <div class="cover-content">
      ${logo ? `<img class="cover-logo" src="${logo}" alt="Logo" />` : ""}
      <div class="cover-eyebrow">LOPEZ HNOS · CATÁLOGO COMERCIAL</div>
      <h1>${escapeHtml(config.title)}</h1>
      <p class="cover-subtitle">${escapeHtml(config.subtitle)}</p>
      ${config.campaignText ? `<p class="cover-campaign">${escapeHtml(config.campaignText)}</p>` : ""}
      ${config.validityText ? `<div class="cover-validity">${escapeHtml(config.validityText)}</div>` : ""}
    </div>
  </section>
  <div class="toolbar screen-only"><div class="toolbar-inner"><strong>${escapeHtml(config.title)}</strong><input id="search" type="search" placeholder="Buscar producto, SKU, marca o modelo..." /><button id="pdf-button" type="button">Generar / Guardar PDF</button></div></div>
  <div class="catalog-layout">
    <aside class="catalog-sidebar screen-only"><div class="sidebar-card">${sidebarVisual}<span class="sidebar-title">${escapeHtml(grouping.pluralLabel)}</span>${groupNav}</div></aside>
    <main class="catalog-main"><div id="no-results" class="no-results">No hay productos que coincidan con la búsqueda.</div>${sections}</main>
  </div>
  <footer class="footer"><div><p><strong>${escapeHtml(config.footerText)}</strong></p><p class="muted">Generado el ${escapeHtml(generatedAt)} · Fuente ${escapeHtml(source)} · ${products.length} productos</p></div></footer>
  <div id="pdf-progress" class="pdf-progress screen-only"><div class="pdf-progress-card"><strong>Preparando catálogo para PDF</strong><p id="pdf-progress-text">Cargando imágenes...</p><div class="pdf-progress-track"><span id="pdf-progress-bar"></span></div><small>No cierres esta ventana. El diálogo de impresión se abrirá cuando todas las imágenes estén listas.</small></div></div>
  <script>
    const search=document.getElementById('search');
    const cards=Array.from(document.querySelectorAll('.product-card'));
    const sections=Array.from(document.querySelectorAll('.category-section'));
    const groupLinks=Array.from(document.querySelectorAll('.group-link'));
    const noResults=document.getElementById('no-results');
    const images=Array.from(document.querySelectorAll('img[data-candidates]'));
    const pdfButton=document.getElementById('pdf-button');
    const progress=document.getElementById('pdf-progress');
    const progressText=document.getElementById('pdf-progress-text');
    const progressBar=document.getElementById('pdf-progress-bar');
    const sidebarCategoryTitle=document.getElementById('sidebar-category-title');
    function setActiveGroup(targetId,label){groupLinks.forEach(link=>link.classList.toggle('active',link.dataset.target===targetId));if(sidebarCategoryTitle&&label)sidebarCategoryTitle.textContent=label;}
    function normalize(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');}
    const queue=[];let active=0;const maxLoads=window.matchMedia('(max-width:680px)').matches?2:4;let settled=0;
    function updateProgress(){const total=images.length;const percent=total?Math.round((settled/total)*100):100;progressText.textContent=total?settled+' de '+total+' imágenes listas':'No hay imágenes pendientes';progressBar.style.width=percent+'%';}
    function pump(){while(active<maxLoads&&queue.length){const task=queue.shift();if(!task||task.img.dataset.settled==='1'){task?.resolve();continue;}active+=1;runTask(task);}}
    function runTask(task){const img=task.img;let candidates=[];try{candidates=JSON.parse(img.dataset.candidates||'[]');}catch{candidates=[];}let index=0;const holder=img.closest('.product-image');img.dataset.loading='1';holder?.classList.add('is-loading');const finish=(ok)=>{if(img.dataset.settled!=='1'){img.dataset.settled='1';settled+=1;updateProgress();}img.dataset.loading='0';holder?.classList.remove('is-loading');holder?.classList.toggle('loaded',ok);holder?.classList.toggle('image-error',!ok);active=Math.max(0,active-1);task.resolve();pump();};const next=()=>{if(index>=candidates.length){finish(false);return;}const source=candidates[index++];img.onload=()=>finish(true);img.onerror=()=>setTimeout(next,180*index);img.src=source;};next();}
    function ensureImage(img){if(img.dataset.settled==='1')return Promise.resolve();if(img._catalogPromise)return img._catalogPromise;img._catalogPromise=new Promise(resolve=>{queue.push({img,resolve});pump();});return img._catalogPromise;}
    const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){ensureImage(entry.target);observer.unobserve(entry.target);}}),{rootMargin:'600px 0px'}):null;
    images.forEach(img=>observer?observer.observe(img):ensureImage(img));
    function waitStaticImages(){const staticImages=Array.from(document.querySelectorAll('img:not([data-candidates])'));return Promise.all(staticImages.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});})));}
    async function preparePdf(){pdfButton.disabled=true;progress.classList.add('active');images.forEach(img=>{img.loading='eager';observer?.unobserve(img);});updateProgress();await Promise.all(images.map(ensureImage));await waitStaticImages();if(document.fonts?.ready)await document.fonts.ready;progressText.textContent='Todo listo. Abriendo impresión...';progressBar.style.width='100%';setTimeout(()=>{progress.classList.remove('active');window.print();},250);}
    pdfButton.addEventListener('click',preparePdf);
    window.addEventListener('afterprint',()=>{pdfButton.disabled=false;pdfButton.textContent='Generar / Guardar PDF';progress.classList.remove('active');});
    function applySearch(){const term=normalize(search.value);let visible=0;cards.forEach(card=>{const show=!term||normalize(card.dataset.search).includes(term);card.style.display=show?'':'none';if(show){visible+=1;const img=card.querySelector('img[data-candidates]');if(img)ensureImage(img);}});sections.forEach(section=>{const show=Array.from(section.querySelectorAll('.product-card')).some(card=>card.style.display!=='none');section.style.display=show?'':'none';const link=document.querySelector('.group-link[data-target="'+section.id+'"]');if(link)link.style.display=show?'':'none';});noResults.style.display=visible?'none':'block';}
    search.addEventListener('input',applySearch);
    groupLinks.forEach(button=>button.addEventListener('click',()=>{setActiveGroup(button.dataset.target,button.dataset.label);document.getElementById(button.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'});}));
    if('IntersectionObserver' in window){const sectionObserver=new IntersectionObserver(entries=>{const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;setActiveGroup(visible.target.id,visible.target.dataset.label);},{rootMargin:'-22% 0px -65% 0px',threshold:[0,.15,.4]});sections.forEach(section=>sectionObserver.observe(section));}
    updateProgress();
  </script>
</body>
</html>`;
}

module.exports = function catalogRoutes(context) {
  const { app, db, queryOdoo, queryOdooCached, uploadsDir } = context;
  const odooQuery = queryOdooCached || queryOdoo;
  const publicApiUrl = String(process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, "");
  const catalogUploadsDir = path.join(uploadsDir, "catalogs");
  fs.mkdirSync(catalogUploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, callback) => callback(null, catalogUploadsDir),
    filename: (req, file, callback) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
      const type = file.fieldname === "cover" ? "portada" : file.fieldname === "banner" ? "banner" : "recurso";
      callback(null, `${req.params.baseKey}-${type}-${Date.now()}${ext}`);
    },
  });

  const uploadCatalog = multer({
    storage,
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
      if (!/^image\/(png|jpeg|webp)$/i.test(file.mimetype || "")) return callback(new Error("Solo se permiten imágenes PNG, JPG o WEBP."));
      callback(null, true);
    },
  });

  app.get("/api/catalogs/options", (req, res) => {
    if (!requireAccess(req, res)) return;
    const items = BASE_LISTS.map((base) => ({
      ...base,
      config: configForResponse(db, base.baseKey, publicApiUrl),
      lists: ["distribuidor", "mostrador"].map((listType) => LIST_META[`${base.baseKey}-${listType}`]),
    }));
    res.json(items);
  });

  app.get("/api/catalogs/history", (req, res) => {
    if (!requireAccess(req, res)) return;
    res.json(db.prepare(`
      SELECT id, base_key, list_key, title, product_count, source, generated_by, generated_at, filename
      FROM catalog_generations ORDER BY id DESC LIMIT 100
    `).all());
  });

  app.get("/api/catalogs/config/:baseKey", (req, res) => {
    if (!requireAccess(req, res)) return;
    if (!baseMeta(req.params.baseKey)) return res.status(404).json({ error: "Línea de negocio no encontrada." });
    res.json(configForResponse(db, req.params.baseKey, publicApiUrl));
  });

  app.put("/api/catalogs/config/:baseKey", (req, res) => {
    if (!requireManage(req, res)) return;
    if (!baseMeta(req.params.baseKey)) return res.status(404).json({ error: "Línea de negocio no encontrada." });
    saveConfig(db, req.params.baseKey, req.body?.config || {}, req.body?.userName || "");
    res.json({ ok: true, config: configForResponse(db, req.params.baseKey, publicApiUrl) });
  });

  app.post("/api/catalogs/config/:baseKey/upload", (req, res, next) => {
    if (!requireManage(req, res)) return;
    uploadCatalog.fields([{ name: "cover", maxCount: 1 }, { name: "banner", maxCount: 1 }])(req, res, (error) => {
      if (error) return res.status(400).json({ error: error.message });
      next();
    });
  }, (req, res) => {
    if (!baseMeta(req.params.baseKey)) return res.status(404).json({ error: "Línea de negocio no encontrada." });
    const current = getConfig(db, req.params.baseKey);
    const coverFile = req.files?.cover?.[0];
    const bannerFile = req.files?.banner?.[0];
    saveConfig(db, req.params.baseKey, {
      ...current,
      coverImageUrl: coverFile ? `/uploads/catalogs/${coverFile.filename}` : current.coverImageUrl,
      bannerImageUrl: bannerFile ? `/uploads/catalogs/${bannerFile.filename}` : current.bannerImageUrl,
    }, req.body?.userName || req.query?.userName || "");
    res.json({ ok: true, config: configForResponse(db, req.params.baseKey, publicApiUrl) });
  });

  app.post("/api/catalogs/config/:baseKey/subcategory-banner", (req, res, next) => {
    if (!requireManage(req, res)) return;
    uploadCatalog.single("banner")(req, res, (error) => {
      if (error) return res.status(400).json({ error: error.message });
      next();
    });
  }, (req, res) => {
    if (!baseMeta(req.params.baseKey)) return res.status(404).json({ error: "Línea de negocio no encontrada." });
    const subcategory = cleanText(req.body?.subcategory || req.query?.subcategory, 240);
    if (!subcategory) return res.status(400).json({ error: "Debe indicar la subcategoría." });
    if (!req.file) return res.status(400).json({ error: "Debe seleccionar una imagen." });
    saveSubcategoryBanner(db, req.params.baseKey, subcategory, `/uploads/catalogs/${req.file.filename}`, req.body?.userName || req.query?.userName || "");
    res.json({ ok: true, config: configForResponse(db, req.params.baseKey, publicApiUrl) });
  });

  app.delete("/api/catalogs/config/:baseKey/subcategory-banner", (req, res) => {
    if (!requireManage(req, res)) return;
    const subcategory = cleanText(req.query?.subcategory, 240);
    if (!subcategory) return res.status(400).json({ error: "Debe indicar la subcategoría." });
    db.prepare("DELETE FROM catalog_subcategory_banners WHERE base_key = ? AND subcategory = ?").run(req.params.baseKey, subcategory);
    res.json({ ok: true });
  });

  app.get("/api/catalogs/:key/facets", async (req, res) => {
    if (!requireAccess(req, res)) return;
    const meta = LIST_META[req.params.key];
    if (!meta) return res.status(404).json({ error: "Catálogo no encontrado." });

    try {
      const config = getConfig(db, meta.baseKey);
      const query = {
        ...req.query,
        search: "",
        stockOnly: req.query.stockOnly ?? String(config.stockOnly),
        publishedOnly: req.query.publishedOnly ?? String(config.publishedOnly),
        limit: "10000",
      };
      const result = await getProducts({ queryOdoo: odooQuery, meta, query: sourceQueryForCatalog(query) });
      const products = result.source === "odoo" ? result.products : filterProducts(result.products, sourceQueryForCatalog(query), meta);
      const baseFiltered = applyCatalogFilters(products, { ...query, category: "", brand: "", subcategory: "", family: "" }, meta, config);
      const primaryFiltered = applyCatalogFilters(products, { ...query, subcategory: "", family: "" }, meta, config);
      const familyFiltered = applyCatalogFilters(products, { ...query, family: "" }, meta, config);
      const grouping = catalogGrouping(meta);
      res.json({
        facets: getFacets(baseFiltered),
        dependentFacets: {
          subcategories: getFacets(primaryFiltered).subcategories,
          families: getFacets(familyFiltered).families,
        },
        total: baseFiltered.length,
        filterMode: grouping.field,
        filterLabel: grouping.label,
        source: result.source,
        warning: result.warning,
      });
    } catch (error) {
      console.error("ERROR CATALOG FACETS:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/catalogs/:key/preview", async (req, res) => {
    if (!requireAccess(req, res)) return;
    const meta = LIST_META[req.params.key];
    if (!meta) return res.status(404).json({ error: "Catálogo no encontrado." });

    try {
      const config = getConfig(db, meta.baseKey);
      const query = {
        ...req.query,
        stockOnly: req.query.stockOnly ?? String(config.stockOnly),
        publishedOnly: req.query.publishedOnly ?? String(config.publishedOnly),
        limit: req.query.limit || "2000",
      };
      const result = await getProducts({ queryOdoo: odooQuery, meta, query: sourceQueryForCatalog(query, "10000") });
      const products = result.source === "odoo" ? result.products : filterProducts(result.products, sourceQueryForCatalog(query, "10000"), meta);
      const filtered = applyCatalogFilters(products, query, meta, config);
      res.json({
        meta,
        config: configForResponse(db, meta.baseKey, publicApiUrl),
        items: filtered.slice(0, Math.min(Number(query.limit || 2000), 2000)),
        total: filtered.length,
        summary: getSummary(filtered),
        facets: getFacets(filtered.length ? filtered : products),
        grouping: catalogGrouping(meta),
        hasMore: filtered.length > Number(query.limit || 2000),
        source: result.source,
        warning: result.warning,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("ERROR CATALOG PREVIEW:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/catalogs/:key/download-html", async (req, res) => {
    if (!requireAccess(req, res)) return;
    const meta = LIST_META[req.params.key];
    if (!meta) return res.status(404).send("Catálogo no encontrado.");

    try {
      const storedConfig = getConfig(db, meta.baseKey);
      const config = {
        ...storedConfig,
        subcategoryBanners: getSubcategoryBanners(db, meta.baseKey),
        showPrices: boolValue(req.query.showPrices, storedConfig.showPrices),
        showCashPrice: boolValue(req.query.showCashPrice, storedConfig.showCashPrice),
        showStock: boolValue(req.query.showStock, storedConfig.showStock),
        stockOnly: boolValue(req.query.stockOnly, storedConfig.stockOnly),
        publishedOnly: boolValue(req.query.publishedOnly, storedConfig.publishedOnly),
      };
      const query = {
        ...req.query,
        stockOnly: String(config.stockOnly),
        publishedOnly: String(config.publishedOnly),
        limit: req.query.limit || "10000",
      };
      const result = await getProducts({ queryOdoo: odooQuery, meta, query: sourceQueryForCatalog(query, "10000") });
      const products = result.source === "odoo" ? result.products : filterProducts(result.products, sourceQueryForCatalog(query, "10000"), meta);
      const filtered = applyCatalogFilters(products, query, meta, config);
      const html = buildCatalogHtml({ meta, products: filtered, config, source: result.source, uploadsDir });
      const date = new Date().toISOString().slice(0, 10);
      const filename = `${slug(config.title)}-${date}.html`;

      db.prepare(`
        INSERT INTO catalog_generations (
          base_key, list_key, title, filters_payload, config_payload,
          product_count, source, generated_by, generated_at, filename
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        meta.baseKey,
        meta.key,
        config.title,
        JSON.stringify(query),
        JSON.stringify(config),
        filtered.length,
        result.source,
        cleanText(req.query.userName, 120),
        new Date().toISOString(),
        filename
      );

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
      res.send(html);
    } catch (error) {
      console.error("ERROR CATALOG DOWNLOAD:", error);
      res.status(500).send(`No se pudo generar el catálogo: ${escapeHtml(error.message)}`);
    }
  });
};

module.exports.helpers = {
  buildCatalogHtml,
  defaultConfigFor,
  groupProducts,
  catalogGrouping,
  imageCandidates,
  applyCatalogFilters,
  parseSelection,
};
