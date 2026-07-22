import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const money = (value) =>
  Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });

function buildImageCandidates(item) {
  const original = String(item?.imageUrl || "").trim();
  if (!original) return [];
  return Array.from(new Set([
    original,
    original.replace("/image_1024/", "/image_512/"),
    original.replace("/image_1024/", "/image_1920/"),
  ].filter(Boolean)));
}

function ProductImage({ item }) {
  const candidates = buildImageCandidates(item);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);


  if (!candidates.length || failed) return <span>Sin imagen</span>;
  const src = candidates[Math.min(attempt, candidates.length - 1)];

  return (
    <img
      src={src}
      alt={item?.name || "Producto"}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (attempt < candidates.length - 1) setAttempt((value) => value + 1);
        else setFailed(true);
      }}
    />
  );
}

function MultiSelect({ label, values, selected, onChange, emptyLabel, help }) {
  const cleanSelected = selected.filter((value) => values.includes(value));
  const summary = cleanSelected.length === 0
    ? emptyLabel
    : cleanSelected.length === 1
      ? cleanSelected[0]
      : `${cleanSelected.length} seleccionados`;

  function toggle(value) {
    if (cleanSelected.includes(value)) onChange(cleanSelected.filter((item) => item !== value));
    else onChange([...cleanSelected, value]);
  }

  return (
    <div className="catalog-multiselect-field">
      <span>{label}</span>
      <details className="catalog-multiselect">
        <summary>{summary}</summary>
        <div className="catalog-multiselect-menu">
          <div className="catalog-multiselect-actions">
            <button type="button" onClick={() => onChange(values)}>Todos</button>
            <button type="button" onClick={() => onChange([])}>Limpiar</button>
          </div>
          <div className="catalog-multiselect-options">
            {values.map((value) => (
              <label key={value}>
                <input type="checkbox" checked={cleanSelected.includes(value)} onChange={() => toggle(value)} />
                <span>{value}</span>
              </label>
            ))}
            {!values.length && <p>No hay opciones disponibles.</p>}
          </div>
        </div>
      </details>
      {help && <small className="catalog-filter-help">{help}</small>}
    </div>
  );
}

function Catalogs({ user }) {
  const [options, setOptions] = useState([]);
  const [selectedKey, setSelectedKey] = useState("motopartes-distribuidor");
  const [preview, setPreview] = useState(null);
  const [facetData, setFacetData] = useState({
    facets: { categories: [], subcategories: [], families: [], brands: [] },
    dependentFacets: { subcategories: [], families: [] },
    total: 0,
  });
  const [history, setHistory] = useState([]);
  const [configDraft, setConfigDraft] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [coverFile, setCoverFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [subcategoryBannerFiles, setSubcategoryBannerFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    categories: [],
    brands: [],
    subcategories: [],
    families: [],
    stockOnly: true,
    publishedOnly: true,
    showPrices: false,
    showCashPrice: false,
    showStock: true,
  });

  const role = user?.role || "";
  const canManage = ["admin", "supervisor", "jefe"].includes(role);

  const selectedMeta = useMemo(() => {
    for (const option of options) {
      const list = (option.lists || []).find((item) => item.key === selectedKey);
      if (list) return { option, list };
    }
    return null;
  }, [options, selectedKey]);

  const filterMode = selectedMeta?.list?.layout === "bicycles" ? "brand" : "category";
  const primaryValues = filterMode === "brand"
    ? (facetData?.facets?.brands || [])
    : (facetData?.facets?.categories || []);
  const selectedPrimary = filterMode === "brand" ? filters.brands : filters.categories;
  const subcategories = facetData?.dependentFacets?.subcategories || facetData?.facets?.subcategories || [];
  const families = facetData?.dependentFacets?.families || facetData?.facets?.families || [];

  useEffect(() => {
    loadOptions();
    loadHistory();
  }, []);

  useEffect(() => {
    if (!selectedKey) return undefined;
    const timer = setTimeout(() => loadPreview(), 300);
    return () => clearTimeout(timer);
  }, [
    selectedKey,
    filters.search,
    JSON.stringify(filters.categories),
    JSON.stringify(filters.brands),
    JSON.stringify(filters.subcategories),
    JSON.stringify(filters.families),
    filters.stockOnly,
    filters.publishedOnly,
  ]);

  useEffect(() => {
    if (!selectedKey) return undefined;
    const timer = setTimeout(() => loadFacets(), 150);
    return () => clearTimeout(timer);
  }, [
    selectedKey,
    JSON.stringify(filters.categories),
    JSON.stringify(filters.brands),
    JSON.stringify(filters.subcategories),
    filters.stockOnly,
    filters.publishedOnly,
  ]);

  async function loadOptions() {
    try {
      setError("");
      const response = await fetch(`${API_URL}/api/catalogs/options?role=${encodeURIComponent(role)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los catálogos");
      setOptions(data || []);
      const current = (data || []).flatMap((item) => item.lists || []).find((item) => item.key === selectedKey);
      const firstKey = current?.key || data?.[0]?.lists?.[0]?.key;
      if (firstKey) setSelectedKey(firstKey);
      const baseKey = (current || data?.[0]?.lists?.[0])?.baseKey;
      const config = (data || []).find((item) => item.baseKey === baseKey)?.config;
      if (config) applyConfig(config);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadHistory() {
    try {
      const response = await fetch(`${API_URL}/api/catalogs/history?role=${encodeURIComponent(role)}`);
      const data = await response.json();
      if (response.ok) setHistory(data || []);
    } catch (err) {
      console.warn(err);
    }
  }

  function applyConfig(config) {
    setConfigDraft(config);
    setFilters((current) => ({
      ...current,
      stockOnly: Boolean(config.stockOnly),
      publishedOnly: Boolean(config.publishedOnly),
      showPrices: Boolean(config.showPrices),
      showCashPrice: Boolean(config.showCashPrice),
      showStock: Boolean(config.showStock),
    }));
  }

  async function loadConfig(baseKey) {
    try {
      const response = await fetch(`${API_URL}/api/catalogs/config/${baseKey}?role=${encodeURIComponent(role)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la configuración");
      applyConfig(data);
    } catch (err) {
      setError(err.message);
    }
  }

  function appendSelections(params) {
    params.set("category", JSON.stringify(filters.categories));
    params.set("brand", JSON.stringify(filters.brands));
    params.set("subcategory", JSON.stringify(filters.subcategories));
    params.set("family", JSON.stringify(filters.families));
    return params;
  }

  async function loadFacets() {
    try {
      const params = appendSelections(new URLSearchParams({
        role,
        stockOnly: String(filters.stockOnly),
        publishedOnly: String(filters.publishedOnly),
      }));
      const response = await fetch(`${API_URL}/api/catalogs/${selectedKey}/facets?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los filtros del catálogo");
      setFacetData(data);
      setFilters((current) => ({
        ...current,
        subcategories: current.subcategories.filter((value) => (data.dependentFacets?.subcategories || []).includes(value)),
        families: current.families.filter((value) => (data.dependentFacets?.families || []).includes(value)),
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadPreview() {
    try {
      setLoading(true);
      setError("");
      const params = appendSelections(new URLSearchParams({
        role,
        search: filters.search,
        stockOnly: String(filters.stockOnly),
        publishedOnly: String(filters.publishedOnly),
        limit: "2000",
      }));
      const response = await fetch(`${API_URL}/api/catalogs/${selectedKey}/preview?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la vista previa");
      setPreview(data);
      if (!configDraft || configDraft.updatedAt !== data.config?.updatedAt) setConfigDraft(data.config);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCatalogChange(key) {
    setSelectedKey(key);
    setFilters((current) => ({
      ...current,
      search: "",
      categories: [],
      brands: [],
      subcategories: [],
      families: [],
    }));
    setSubcategoryBannerFiles({});
    const next = options.flatMap((item) => item.lists || []).find((item) => item.key === key);
    if (next?.baseKey) loadConfig(next.baseKey);
  }

  function updatePrimary(values) {
    setFilters((current) => ({
      ...current,
      categories: filterMode === "category" ? values : [],
      brands: filterMode === "brand" ? values : [],
      subcategories: [],
      families: [],
    }));
  }

  function updateConfig(name, value) {
    setConfigDraft((current) => ({ ...(current || {}), [name]: value }));
  }

  async function uploadSubcategoryBanners(baseKey) {
    const entries = Object.entries(subcategoryBannerFiles).filter(([, file]) => file);
    for (const [subcategory, file] of entries) {
      const formData = new FormData();
      formData.append("subcategory", subcategory);
      formData.append("banner", file);
      formData.append("role", role);
      formData.append("userName", user?.name || "");
      const response = await fetch(`${API_URL}/api/catalogs/config/${baseKey}/subcategory-banner?role=${encodeURIComponent(role)}&userName=${encodeURIComponent(user?.name || "")}`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `No se pudo guardar el banner de ${subcategory}`);
    }
  }

  async function removeSubcategoryBanner(subcategory) {
    const baseKey = selectedMeta?.list?.baseKey;
    if (!baseKey) return;
    try {
      const response = await fetch(`${API_URL}/api/catalogs/config/${baseKey}/subcategory-banner?role=${encodeURIComponent(role)}&subcategory=${encodeURIComponent(subcategory)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo quitar el banner");
      await loadConfig(baseKey);
      setNotice(`Banner de ${subcategory} eliminado.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveVisualConfig() {
    const baseKey = selectedMeta?.list?.baseKey;
    if (!baseKey || !configDraft) return;

    try {
      setSaving(true);
      setError("");
      setNotice("");

      const response = await fetch(`${API_URL}/api/catalogs/config/${baseKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          userName: user?.name || "",
          config: {
            ...configDraft,
            showPrices: filters.showPrices,
            showCashPrice: filters.showCashPrice,
            showStock: filters.showStock,
            stockOnly: filters.stockOnly,
            publishedOnly: filters.publishedOnly,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la configuración");

      if (coverFile || bannerFile) {
        const formData = new FormData();
        formData.append("role", role);
        formData.append("userName", user?.name || "");
        if (coverFile) formData.append("cover", coverFile);
        if (bannerFile) formData.append("banner", bannerFile);

        const uploadResponse = await fetch(`${API_URL}/api/catalogs/config/${baseKey}/upload?role=${encodeURIComponent(role)}&userName=${encodeURIComponent(user?.name || "")}`, {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadData.error || "No se pudieron cargar las imágenes");
      }

      await uploadSubcategoryBanners(baseKey);
      setCoverFile(null);
      setBannerFile(null);
      setSubcategoryBannerFiles({});
      await loadConfig(baseKey);
      await loadPreview();
      await loadOptions();
      setNotice("Diseño, colores y banners guardados correctamente.");
      setConfigOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function downloadCatalog() {
    const params = appendSelections(new URLSearchParams({
      role,
      userName: user?.name || "",
      search: filters.search,
      stockOnly: String(filters.stockOnly),
      publishedOnly: String(filters.publishedOnly),
      showPrices: String(filters.showPrices),
      showCashPrice: String(filters.showCashPrice),
      showStock: String(filters.showStock),
      limit: "10000",
    }));
    window.open(`${API_URL}/api/catalogs/${selectedKey}/download-html?${params.toString()}`, "_blank");
    setTimeout(loadHistory, 1200);
  }

  const items = preview?.items || [];
  const config = preview?.config || configDraft || {};
  const previewItems = items.slice(0, 80);
  const anySelection = filters.categories.length || filters.brands.length || filters.subcategories.length || filters.families.length || filters.search;
  const totalForDisplay = !anySelection ? (facetData?.total || preview?.total || 0) : (preview?.total || 0);
  const currentSubcategoryBanners = configDraft?.subcategoryBanners || {};

  return (
    <section className="catalog-module">
      <header className="catalog-page-header">
        <div>
          <span className="catalog-kicker">SGI · GENERADOR AUTOMÁTICO</span>
          <h1>Catálogos comerciales</h1>
          <p>Generá material actualizado por línea de negocio directamente desde Odoo.</p>
        </div>
        <div className="catalog-header-actions">
          {canManage && (
            <button className="secondary-button" onClick={() => setConfigOpen((value) => !value)}>
              {configOpen ? "Cerrar configuración" : "Diseño y portada"}
            </button>
          )}
          <button className="primary-button" onClick={downloadCatalog} disabled={!items.length || loading}>
            Descargar catálogo
          </button>
        </div>
      </header>

      {error && <div className="catalog-message error">{error}</div>}
      {notice && <div className="catalog-message success">{notice}</div>}
      {preview?.warning && <div className="catalog-message warning">{preview.warning}</div>}

      <div className="catalog-toolbar-card catalog-toolbar-expanded">
        <label>
          Línea y lista
          <select value={selectedKey} onChange={(event) => handleCatalogChange(event.target.value)}>
            {options.map((option) => (
              <optgroup key={option.baseKey} label={option.titleBase}>
                {(option.lists || []).map((list) => <option key={list.key} value={list.key}>{list.title}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        <MultiSelect
          label={filterMode === "brand" ? "Marca" : "Categoría"}
          values={primaryValues}
          selected={selectedPrimary}
          onChange={updatePrimary}
          emptyLabel={filterMode === "brand" ? "Todas las marcas" : "Todas las categorías"}
          help={`${primaryValues.length} opciones disponibles.`}
        />

        <MultiSelect
          label="Subcategoría"
          values={subcategories}
          selected={filters.subcategories}
          onChange={(values) => setFilters((current) => ({ ...current, subcategories: values, families: [] }))}
          emptyLabel="Todas las subcategorías"
          help={`${subcategories.length} opciones para la selección actual.`}
        />

        <MultiSelect
          label="Familia"
          values={families}
          selected={filters.families}
          onChange={(values) => setFilters((current) => ({ ...current, families: values }))}
          emptyLabel="Todas las familias"
          help={`${families.length} opciones para la selección actual.`}
        />

        <label className="catalog-search-field">
          Buscar
          <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="SKU, producto, marca o modelo" />
        </label>
      </div>

      <div className="catalog-toggle-row">
        <label><input type="checkbox" checked={filters.stockOnly} onChange={(event) => setFilters((current) => ({ ...current, stockOnly: event.target.checked }))} /> Solo productos disponibles</label>
        <label><input type="checkbox" checked={filters.publishedOnly} onChange={(event) => setFilters((current) => ({ ...current, publishedOnly: event.target.checked }))} /> Solo productos publicados en web</label>
        <label><input type="checkbox" checked={filters.showStock} onChange={(event) => setFilters((current) => ({ ...current, showStock: event.target.checked }))} /> Mostrar disponibilidad</label>
        <label><input type="checkbox" checked={filters.showPrices} onChange={(event) => setFilters((current) => ({ ...current, showPrices: event.target.checked }))} /> Mostrar precios</label>
        {filters.showPrices && <label><input type="checkbox" checked={filters.showCashPrice} onChange={(event) => setFilters((current) => ({ ...current, showCashPrice: event.target.checked }))} /> Mostrar contado</label>}
      </div>

      {configOpen && canManage && configDraft && (
        <section className="catalog-config-panel">
          <div className="catalog-config-title">
            <div><h2>Diseño, portada y PDF</h2><p>La configuración se guarda por línea y se utiliza tanto en el HTML como al imprimir o guardar en PDF.</p></div>
            <span>Supervisor / Jefe</span>
          </div>
          <div className="catalog-config-grid">
            <label>Título<input value={configDraft.title || ""} onChange={(event) => updateConfig("title", event.target.value)} /></label>
            <label>Subtítulo<input value={configDraft.subtitle || ""} onChange={(event) => updateConfig("subtitle", event.target.value)} /></label>
            <label>Vigencia o campaña<input value={configDraft.validityText || ""} onChange={(event) => updateConfig("validityText", event.target.value)} placeholder="Ej. Agosto 2026" /></label>
            <label>Estilo<select value={configDraft.cardStyle || "modern"} onChange={(event) => updateConfig("cardStyle", event.target.value)}><option value="modern">Moderno</option><option value="classic">Clásico</option><option value="compact">Compacto</option></select></label>
            <label>Orientación PDF<select value={configDraft.printOrientation || "portrait"} onChange={(event) => updateConfig("printOrientation", event.target.value)}><option value="portrait">Vertical</option><option value="landscape">Horizontal</option></select></label>
            <label>Color principal<input type="color" value={configDraft.primaryColor || "#0f172a"} onChange={(event) => updateConfig("primaryColor", event.target.value)} /></label>
            <label>Color secundario<input type="color" value={configDraft.secondaryColor || "#2563eb"} onChange={(event) => updateConfig("secondaryColor", event.target.value)} /></label>
            <label>Fondo del catálogo<input type="color" value={configDraft.pageBackgroundColor || "#eef2f7"} onChange={(event) => updateConfig("pageBackgroundColor", event.target.value)} /></label>
            <label>Fondo de tarjetas<input type="color" value={configDraft.cardBackgroundColor || "#ffffff"} onChange={(event) => updateConfig("cardBackgroundColor", event.target.value)} /></label>
            <label>Color de texto<input type="color" value={configDraft.textColor || "#0f172a"} onChange={(event) => updateConfig("textColor", event.target.value)} /></label>
            <label className="catalog-wide-field">Texto de campaña<textarea rows="3" value={configDraft.campaignText || ""} onChange={(event) => updateConfig("campaignText", event.target.value)} placeholder="Novedades, temporada, lanzamiento o mensaje comercial..." /></label>
            <label className="catalog-wide-field">Pie del catálogo<input value={configDraft.footerText || ""} onChange={(event) => updateConfig("footerText", event.target.value)} /></label>
            <label>Imagen de portada<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setCoverFile(event.target.files?.[0] || null)} /></label>
            <label>Banner de categoría / respaldo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBannerFile(event.target.files?.[0] || null)} /><small>Se usa en el lateral del HTML y como respaldo cuando una subcategoría no tiene banner propio.</small></label>
            <label className="catalog-toggle-setting"><input type="checkbox" checked={Boolean(configDraft.showCategoryBanner)} onChange={(event) => updateConfig("showCategoryBanner", event.target.checked)} /><span><strong>Mostrar banner de categoría</strong><small>Se integra en la navegación lateral del HTML y no se exporta al PDF.</small></span></label>
            <label className="catalog-toggle-setting"><input type="checkbox" checked={Boolean(configDraft.showSubcategoryBanner)} onChange={(event) => updateConfig("showSubcategoryBanner", event.target.checked)} /><span><strong>Mostrar banner de subcategoría</strong><small>Se muestra antes de los productos y sí forma parte del PDF.</small></span></label>
          </div>

          <div className="catalog-subcategory-banners">
            <div className="catalog-config-title">
              <div><h3>Banners por subcategoría</h3><p>Seleccioná una o varias subcategorías arriba y cargá una imagen específica para cada sección. Se usarán cuando esté activa la opción “Mostrar banner de subcategoría”.</p></div>
            </div>
            {filters.subcategories.length ? (
              <div className="catalog-banner-grid">
                {filters.subcategories.map((subcategory) => {
                  const currentBanner = currentSubcategoryBanners[subcategory];
                  return (
                    <article key={subcategory} className="catalog-banner-config-card">
                      <div>
                        <strong>{subcategory}</strong>
                        <span>{currentBanner ? "Banner configurado" : "Usará el banner general"}</span>
                      </div>
                      {currentBanner?.previewUrl && <img src={currentBanner.previewUrl} alt={`Banner ${subcategory}`} />}
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setSubcategoryBannerFiles((current) => ({ ...current, [subcategory]: event.target.files?.[0] || null }))} />
                      {currentBanner && <button type="button" className="secondary-button" onClick={() => removeSubcategoryBanner(subcategory)}>Quitar banner</button>}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="catalog-empty-banner-note">Elegí las subcategorías que incluirá este catálogo para configurar sus banners individuales.</p>
            )}
          </div>

          <div className="catalog-config-actions">
            <button className="primary-button" onClick={saveVisualConfig} disabled={saving}>{saving ? "Guardando..." : "Guardar diseño"}</button>
          </div>
        </section>
      )}

      <section
        className="catalog-preview-shell"
        style={{
          "--catalog-primary": config.primaryColor || "#0f172a",
          "--catalog-secondary": config.secondaryColor || "#2563eb",
          "--catalog-page-bg": config.pageBackgroundColor || "#eef2f7",
          "--catalog-card-bg": config.cardBackgroundColor || "#ffffff",
          "--catalog-text": config.textColor || "#0f172a",
        }}
      >
        <div className="catalog-cover-preview" style={config.coverPreviewUrl ? { backgroundImage: `linear-gradient(90deg, rgba(2,6,23,.9), rgba(2,6,23,.28)), url("${config.coverPreviewUrl}")` } : undefined}>
          <div>
            {config.logoPreviewUrl && <img src={config.logoPreviewUrl} alt="Logo" />}
            <span>LOPEZ HNOS · CATÁLOGO COMERCIAL</span>
            <h2>{config.title || "Catálogo comercial"}</h2>
            <p>{config.subtitle}</p>
            {config.campaignText && <small>{config.campaignText}</small>}
            {config.validityText && <b>{config.validityText}</b>}
          </div>
        </div>

        <div className="catalog-preview-heading">
          <div><span>VISTA PREVIA</span><h2>{selectedMeta?.list?.title || "Catálogo"}</h2></div>
          <div className="catalog-preview-stats">
            <strong>{totalForDisplay}{preview?.hasMore && anySelection ? "+" : ""}</strong><span>productos</span>
            <strong>{primaryValues.length}</strong><span>{filterMode === "brand" ? "marcas" : "categorías"}</span>
          </div>
        </div>

        {loading ? (
          <div className="catalog-loading">Consultando productos y preparando la vista previa...</div>
        ) : previewItems.length ? (
          <div className={`catalog-product-grid style-${config.cardStyle || "modern"}`}>
            {previewItems.map((item) => (
              <article className="catalog-product-card" key={`${item.productId}-${item.sku}`}>
                <div className="catalog-product-image"><ProductImage item={item} /></div>
                <div className="catalog-product-info">
                  <div className="catalog-product-top"><span>{item.sku}</span>{filters.showStock && <b className={Number(item.availableStock || item.stock || 0) > 0 ? "ok" : "ask"}>{Number(item.availableStock || item.stock || 0) > 0 ? "Disponible" : "Consultar"}</b>}</div>
                  <h3>{item.name}</h3>
                  <p>{[item.brand, item.model].filter(Boolean).join(" · ")}</p>
                  <small>{[item.category, item.subcategory, item.family].filter(Boolean).join(" › ")}</small>
                  {filters.showPrices && <div className="catalog-card-price"><span>{selectedMeta?.list?.listTypeLabel}</span><strong>{money(item.priceDistributor)}</strong>{filters.showCashPrice && <small>Contado {money(item.priceCash)}</small>}</div>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="catalog-loading">No hay productos para los filtros seleccionados.</div>
        )}
        {items.length > previewItems.length && <p className="catalog-preview-limit">La vista previa muestra los primeros {previewItems.length}. La descarga consulta la selección completa en Odoo.</p>}
      </section>

      <section className="catalog-history-section">
        <div className="catalog-history-title"><div><h2>Historial de generación</h2><p>Registro de los catálogos descargados desde el SGI.</p></div><button className="secondary-button" onClick={loadHistory}>Actualizar</button></div>
        <div className="catalog-history-table-wrap">
          <table className="catalog-history-table">
            <thead><tr><th>Fecha</th><th>Catálogo</th><th>Lista</th><th>Productos</th><th>Generado por</th><th>Fuente</th></tr></thead>
            <tbody>
              {history.slice(0, 20).map((item) => <tr key={item.id}><td>{item.generated_at ? new Date(item.generated_at).toLocaleString("es-AR") : "-"}</td><td>{item.title}</td><td>{item.list_key}</td><td>{item.product_count}</td><td>{item.generated_by || "-"}</td><td>{item.source}</td></tr>)}
              {!history.length && <tr><td colSpan="6">Todavía no se generaron catálogos.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default Catalogs;
