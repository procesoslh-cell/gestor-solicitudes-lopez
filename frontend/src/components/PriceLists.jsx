import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const money = (value) =>
  Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });

function PriceLists({ user }) {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState("bicipartes-distribuidor");
  const [items, setItems] = useState([]);
  const [facets, setFacets] = useState({
    categories: [],
    subcategories: [],
    families: [],
    brands: [],
    models: [],
  });
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState("");
  const [warning, setWarning] = useState("");
  const [config, setConfig] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    subcategory: "",
    family: "",
    brand: "",
    model: "",
    stockOnly: true,
  });

  useEffect(() => {
    loadLists();
    loadConfig();
  }, []);

  useEffect(() => {
    loadList();
  }, [selectedList, filters]);

  async function loadLists() {
    try {
      const response = await fetch(`${API_URL}/api/price-lists`);
      const data = await response.json();
      setLists(data || []);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar las listas disponibles.");
    }
  }

  async function loadConfig() {
    try {
      const response = await fetch(`${API_URL}/api/price-lists/config`);
      const data = await response.json();
      setConfig(data);
      setConfigDraft(data);
    } catch (err) {
      console.warn("No se pudo cargar configuración de listas", err);
    }
  }

  async function loadList() {
    try {
      setLoading(true);
      setError("");
      setWarning("");

      const params = buildParams("800");
      const response = await fetch(
        `${API_URL}/api/price-lists/${selectedList}?${params.toString()}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error cargando lista");
      }

      setItems(data.items || []);
      setFacets(data.facets || facets);
      setSummary(data.summary || null);
      setTotal(data.total || 0);
      setSource(data.source || "");
      setWarning(data.warning || "");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo cargar la lista.");
    } finally {
      setLoading(false);
    }
  }

  function buildParams(limit = "800") {
    return new URLSearchParams({
      search: filters.search,
      category: filters.category,
      subcategory: filters.subcategory,
      family: filters.family,
      brand: filters.brand,
      model: filters.model,
      stockOnly: String(filters.stockOnly),
      limit,
    });
  }

  function updateFilter(name, value) {
    setFilters((current) => {
      const next = { ...current, [name]: value };
      if (name === "category") {
        next.subcategory = "";
        next.family = "";
      }
      if (name === "subcategory") {
        next.family = "";
      }
      if (name === "brand") {
        next.model = "";
      }
      return next;
    });
  }

  function handleListChange(key) {
    setSelectedList(key);
    setFilters({
      search: "",
      category: "",
      subcategory: "",
      family: "",
      brand: "",
      model: "",
      stockOnly: true,
    });
  }

  function resetFilters() {
    setFilters({
      search: "",
      category: "",
      subcategory: "",
      family: "",
      brand: "",
      model: "",
      stockOnly: true,
    });
  }


  function updateConfigPercent(baseKey, listType, value) {
    const pct = Math.max(0, Math.min(100, Number(value || 0)));
    setConfigDraft((current) => ({
      ...(current || {}),
      listsPct: {
        ...((current || {}).listsPct || {}),
        [baseKey]: {
          ...(((current || {}).listsPct || {})[baseKey] || {}),
          [listType]: pct,
        },
      },
    }));
  }

  function updateCashDiscount(value) {
    const pct = Math.max(0, Math.min(100, Number(value || 0)));
    setConfigDraft((current) => ({
      ...(current || {}),
      cashDiscountPct: pct,
    }));
  }

  function updateIvaRate(value) {
    const pct = Math.max(0, Math.min(100, Number(value || 0)));
    setConfigDraft((current) => ({
      ...(current || {}),
      ivaRatePct: pct,
    }));
  }

  async function saveConfig() {
    if (!configDraft) return;
    try {
      setSavingConfig(true);
      setError("");
      const payload = {
        role: user?.role || "",
        config: {
          cashDiscount: Number(configDraft.cashDiscountPct || 0) / 100,
          ivaRate: Number(configDraft.ivaRatePct || 0) / 100,
          lists: Object.fromEntries(
            Object.entries(configDraft.listsPct || {}).map(([baseKey, values]) => [
              baseKey,
              {
                distribuidor: Number(values.distribuidor || 0) / 100,
                mostrador: Number(values.mostrador || 0) / 100,
              },
            ])
          ),
        },
      };

      const response = await fetch(`${API_URL}/api/price-lists/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la configuración");
      await loadConfig();
      await loadList();
      setConfigOpen(false);
    } catch (err) {
      setError(err.message || "No se pudo guardar la configuración");
    } finally {
      setSavingConfig(false);
    }
  }

  function downloadHtml() {
    const params = buildParams("10000");
    window.open(
      `${API_URL}/api/price-lists/${selectedList}/download-html?${params.toString()}`,
      "_blank"
    );
  }

  function downloadCSV() {
    const headers = [
      "SKU",
      "Producto",
      "Marca",
      "Modelo",
      "Categoria",
      "Subcategoria",
      "Familia",
      "Disponibilidad",
      "Stock real",
      "Stock venta",
      `Precio lista (IVA ${config?.ivaRatePct ?? 21}%)`,
      selectedMeta?.listTypeLabel || "Lista",
      "Contado 7 dias",
    ];

    const rows = items.map((item) => [
      item.sku,
      item.name,
      item.brand,
      item.model,
      item.category,
      item.subcategory,
      item.family,
      Number(item.availableStock ?? item.stock ?? 0) > 0 ? "Disponible" : "Consultar",
      Number(item.realStock ?? item.stockReal ?? 0),
      Number(item.availableStock ?? item.stock ?? 0),
      item.priceBase,
      item.priceDistributor,
      item.priceCash,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedList}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const selectedMeta = useMemo(
    () => lists.find((item) => item.key === selectedList),
    [lists, selectedList]
  );

  const isBicycles = selectedMeta?.layout === "bicycles";
  const canManageConfig = user?.role === "admin";

  const availableFacets = useMemo(() => {
    function filterFor(field) {
      return items.filter((item) => {
        const haystack = `${item.sku} ${item.name} ${item.brand} ${item.model} ${item.category} ${item.subcategory} ${item.family}`.toLowerCase();
        if (filters.search && !haystack.includes(filters.search.toLowerCase())) return false;
        if (isBicycles) {
          if (field !== "brand" && filters.brand && item.brand !== filters.brand) return false;
          return true;
        }
        if (field !== "category" && filters.category && item.category !== filters.category) return false;
        if (field !== "subcategory" && filters.subcategory && item.subcategory !== filters.subcategory) return false;
        if (field !== "family" && filters.family && item.family !== filters.family) return false;
        return true;
      });
    }

    function uniq(field) {
      return Array.from(new Set(filterFor(field).map((item) => item[field]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "es"));
    }

    return {
      categories: uniq("category"),
      subcategories: uniq("subcategory"),
      families: uniq("family"),
      brands: uniq("brand"),
      models: uniq("model"),
    };
  }, [items, filters, isBicycles]);

  const ivaPct = Number(config?.ivaRatePct ?? 21);
  const ivaMessage = ivaPct > 0
    ? `Precios con IVA ${ivaPct}% incluido.`
    : "Precios sin IVA agregado.";

  const grouped = useMemo(() => {
    const map = new Map();

    items.forEach((item) => {
      const groupKey = isBicycles
        ? [item.brand || "Sin marca", item.model || "Sin modelo"].join("|||")
        : [item.category, item.subcategory, item.family].join("|||");

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          brand: item.brand || "Sin marca",
          model: item.model || "Sin modelo",
          category: item.category,
          subcategory: item.subcategory,
          family: item.family,
          items: [],
        });
      }

      map.get(groupKey).items.push(item);
    });

    return Array.from(map.values());
  }, [items, isBicycles]);

  return (
    <div className="price-lists-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Comercial / listas de precios</span>
          <h1>Listas de precios</h1>
          <p>{ivaMessage} Sujeto a disponibilidad y actualización comercial.</p>
        </div>

        <div className="header-actions">
          {canManageConfig && (
            <button className="secondary-button" onClick={() => setConfigOpen((current) => !current)}>
              Configurar precios
            </button>
          )}
          <button className="secondary-button" onClick={downloadCSV}>
            Descargar CSV
          </button>
          <button className="primary-button" onClick={downloadHtml}>
            Descargar HTML
          </button>
        </div>
      </header>

      <section className="price-list-selector-grid">
        {lists.map((list) => (
          <button
            key={list.key}
            className={`price-list-card ${selectedList === list.key ? "active" : ""}`}
            onClick={() => handleListChange(list.key)}
          >
            <span>{list.business}</span>
            <strong>{list.title}</strong>
            <small>
              {list.listTypeLabel} · {list.source === "odoo" ? "Odoo" : "base local"}
            </small>
          </button>
        ))}
      </section>


      {canManageConfig && configOpen && configDraft && (
        <section className="price-config-panel">
          <div className="price-config-header">
            <div>
              <strong>Configuración de precios</strong>
              <span>Solo administrador · el IVA se aplica sobre el precio base de Odoo</span>
            </div>
            <div className="price-config-global-fields">
              <label>
                IVA
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={configDraft.ivaRatePct ?? 21}
                  onChange={(event) => updateIvaRate(event.target.value)}
                />
                <small>%</small>
              </label>
              <label>
                Contado 7 días
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={configDraft.cashDiscountPct || 0}
                  onChange={(event) => updateCashDiscount(event.target.value)}
                />
                <small>%</small>
              </label>
            </div>
          </div>

          <div className="price-config-grid">
            {Object.entries(configDraft.listsPct || {}).map(([baseKey, values]) => (
              <div className="price-config-row" key={baseKey}>
                <strong>{baseKey}</strong>
                <label>
                  Distribuidor
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={values.distribuidor || 0}
                    onChange={(event) => updateConfigPercent(baseKey, "distribuidor", event.target.value)}
                  />
                  <small>%</small>
                </label>
                <label>
                  Mostrador
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={values.mostrador || 0}
                    onChange={(event) => updateConfigPercent(baseKey, "mostrador", event.target.value)}
                  />
                  <small>%</small>
                </label>
              </div>
            ))}
          </div>
          <div className="price-config-actions">
            <button className="secondary-button" onClick={() => { setConfigDraft(config); setConfigOpen(false); }}>
              Cancelar
            </button>
            <button className="primary-button" onClick={saveConfig} disabled={savingConfig}>
              {savingConfig ? "Guardando..." : "Guardar configuración"}
            </button>
          </div>
        </section>
      )}

      <section className={`filters-card price-filters-card ${isBicycles ? "bicycle-filter-layout" : ""}`}>
        <input
          className="search-input"
          placeholder="Buscar por SKU, artículo, marca, modelo o familia..."
          value={filters.search}
          onChange={(event) => updateFilter("search", event.target.value)}
        />

        {isBicycles ? (
          <>
            <select
              value={filters.brand}
              onChange={(event) => updateFilter("brand", event.target.value)}
            >
              <option value="">Todas las marcas</option>
              {availableFacets.brands.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={filters.model}
              onChange={(event) => updateFilter("model", event.target.value)}
            >
              <option value="">Todos los modelos</option>
              {availableFacets.models.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <select
              value={filters.category}
              onChange={(event) => updateFilter("category", event.target.value)}
            >
              <option value="">Todas las categorías</option>
              {availableFacets.categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={filters.subcategory}
              onChange={(event) => updateFilter("subcategory", event.target.value)}
            >
              <option value="">Todas las subcategorías</option>
              {availableFacets.subcategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={filters.family}
              onChange={(event) => updateFilter("family", event.target.value)}
            >
              <option value="">Todas las familias</option>
              {availableFacets.families.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="switch-line">
          <input
            type="checkbox"
            checked={filters.stockOnly}
            onChange={(event) => updateFilter("stockOnly", event.target.checked)}
          />
          Solo productos con stock
        </label>

        <button className="secondary-button" onClick={resetFilters}>
          Limpiar filtros
        </button>
      </section>



      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-box">Cargando lista...</div>}

      {imagePreview && (
        <div className="price-product-preview" aria-hidden="true">
          <img
            src={imagePreview.url}
            alt={`Vista previa de ${imagePreview.name || "producto"}`}
            onError={() => setImagePreview(null)}
          />
          <strong>{imagePreview.name}</strong>
        </div>
      )}

      {!loading && !error && (
        <section className="price-groups-wrapper">
          {grouped.length === 0 ? (
            <div className="empty-box">No hay productos para los filtros actuales.</div>
          ) : (
            grouped.map((group) => (
              <article
                key={isBicycles ? `${group.brand}-${group.model}` : `${group.category}-${group.subcategory}-${group.family}`}
                className="price-group-card"
              >
                {isBicycles ? (
                  <>
                    <div className="price-category-header">{group.brand}</div>
                    <div className="price-model-header">Modelo: {group.model}</div>
                  </>
                ) : (
                  <>
                    <div className="price-category-header">{group.category}</div>
                    <div className="price-subcategory-header">{group.subcategory}</div>
                    <div className="price-family-header">{group.family}</div>
                  </>
                )}

                <div className="price-table-scroll">
                  <table className="price-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Artículo</th>
                        <th>Marca / modelo</th>
                        <th>Disponibilidad</th>
                        <th>Stock real</th>
                        <th>Stock venta</th>
                        <th>Lista</th>
                        <th>{selectedMeta?.listTypeLabel || "Lista"}</th>
                        <th>Contado 7 días</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <tr key={item.sku}>
                          <td>
                            <strong className="sku-link">{item.sku}</strong>
                          </td>
                          <td>
                            <div className="price-product-cell">
                              {item.imageUrl && (
                                <img
                                  className="price-product-thumb"
                                  src={item.imageUrl}
                                  alt=""
                                  loading="lazy"
                                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                                />
                              )}
                              <div>
                                {item.imageUrl ? (
                                  <a
                                    className="price-product-name-link"
                                    href={item.imageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onMouseEnter={() => setImagePreview({ url: item.imageUrl, name: item.name })}
                                    onMouseLeave={() => setImagePreview(null)}
                                    onFocus={() => setImagePreview({ url: item.imageUrl, name: item.name })}
                                    onBlur={() => setImagePreview(null)}
                                    title="Abrir imagen del producto"
                                  >
                                    {item.name}
                                  </a>
                                ) : (
                                  <strong>{item.name}</strong>
                                )}
                                <small>
                                  {[item.category, item.subcategory, item.family]
                                    .filter(Boolean)
                                    .join(" › ")}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span>{item.brand || "-"}</span>
                            <small>{item.model || ""}</small>
                          </td>
                          <td>
                            <span className="stock-pill">
                              {Number(item.availableStock ?? item.stock ?? 0) > 0 ? "Disponible" : "Consultar"}
                            </span>
                          </td>
                          <td>{Number(item.realStock ?? item.stockReal ?? 0).toLocaleString("es-AR")}</td>
                          <td>{Number(item.availableStock ?? item.stock ?? 0).toLocaleString("es-AR")}</td>
                          <td>{money(item.priceBase)}</td>
                          <td>
                            <strong>{money(item.priceDistributor)}</strong>
                          </td>
                          <td>
                            <strong>{money(item.priceCash)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))
          )}
        </section>
      )}
    </div>
  );
}

export default PriceLists;
