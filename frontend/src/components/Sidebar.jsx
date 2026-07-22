import { useEffect, useMemo, useState } from "react";

function normalizeOrder(order, defaultOrder) {
  const safeOrder = Array.isArray(order) ? order : [];
  const valid = safeOrder.filter((id) => defaultOrder.includes(id));
  const missing = defaultOrder.filter((id) => !valid.includes(id));
  return [...valid, ...missing];
}

function readSavedOrder(storageKey, defaultOrder) {
  try {
    return normalizeOrder(JSON.parse(localStorage.getItem(storageKey) || "[]"), defaultOrder);
  } catch {
    return defaultOrder;
  }
}

function Sidebar({
  currentUser,
  currentView,
  onFilterChange,
  onOpenCommercial,
  onOpenTrips,
  onOpenMyTrip,
  onOpenTripTracking,
  onOpenDashboard,
  onLogout,
  onOpenUsers,
  onOpenCollections,
  onOpenCreditAccounts,
  onOpenCustomersToSell,
  onOpenScoreConfig,
  onOpenCommercialObjectives,
  onOpenPriceLists,
  onOpenCatalogs,
  onOpenCommissions,
}) {
  const isCommercialUser = ["vendedor", "supervisor", "admin", "gerente", "jefe"].includes(
    currentUser.role
  );

  const canSeeRadiography = ["vendedor", "supervisor", "admin"].includes(
    currentUser.role
  );

  const canSeeManagement = ["supervisor", "admin", "gerente", "jefe"].includes(currentUser.role);
  const canConfigureScore = ["admin", "cuentas", "gerente", "jefe"].includes(currentUser.role);
  const canSeeCommissions = ["supervisor", "jefe", "gerente", "rrhh", "admin"].includes(currentUser.role);
  const isHrUser = currentUser.role === "rrhh";

  const storageKey = useMemo(
    () => `sgi_sidebar_order_${currentUser.email || currentUser.name || "usuario"}_${currentUser.role}`,
    [currentUser.email, currentUser.name, currentUser.role]
  );

  const menuItems = useMemo(
    () => [
      {
        id: "requests",
        label: "Solicitudes",
        visible: !isHrUser,
        active: currentView === "requests",
        onClick: () => onFilterChange("Todas"),
      },
      {
        id: "commercial",
        label: "Radiografía Comercial",
        visible: canSeeRadiography,
        active: currentView === "commercial",
        onClick: onOpenCommercial,
      },
      {
        id: "commercial-objectives",
        label: currentUser.role === "vendedor" ? "Mi objetivo" : "Objetivos comerciales",
        visible: isCommercialUser,
        active: currentView === "commercial-objectives",
        onClick: onOpenCommercialObjectives,
      },
      {
        id: "my-trip",
        label: "Mi gira",
        visible: currentUser.role === "vendedor",
        active: currentView === "my-trip",
        onClick: onOpenMyTrip,
      },
      {
        id: "price-lists",
        label: "Listas de precios",
        visible: isCommercialUser,
        active: currentView === "price-lists",
        onClick: onOpenPriceLists,
      },
      {
        id: "catalogs",
        label: "Catálogos comerciales",
        visible: canSeeManagement,
        active: currentView === "catalogs",
        onClick: onOpenCatalogs,
      },
      {
        id: "commissions",
        label: "Liquidación de comisiones",
        visible: canSeeCommissions,
        active: currentView === "commissions",
        onClick: onOpenCommissions,
      },
      {
        id: "trip-tracking",
        label: "Seguimiento giras",
        visible: canSeeManagement,
        active: currentView === "trip-tracking",
        onClick: onOpenTripTracking,
      },
      {
        id: "trips",
        label: "Giras comerciales",
        visible: isCommercialUser,
        active: currentView === "trips",
        onClick: onOpenTrips,
      },
      {
        id: "credit-accounts",
        label: "Cuenta Cliente",
        visible: !isHrUser,
        active: currentView === "credit-accounts",
        onClick: onOpenCreditAccounts,
      },
      {
        id: "customers-to-sell",
        label: "Clientes para vender",
        visible: !isHrUser,
        active: currentView === "customers-to-sell",
        onClick: onOpenCustomersToSell,
      },
      {
        id: "score-config",
        label: "Configuración Score",
        visible: canConfigureScore,
        active: currentView === "score-config",
        onClick: onOpenScoreConfig,
      },
      {
        id: "collections",
        label: "Cobranzas",
        visible: !isHrUser,
        active: currentView === "collections",
        onClick: onOpenCollections,
      },
      {
        id: "dashboard",
        label: "Panel de control comercial",
        visible: canSeeManagement,
        active: currentView === "dashboard",
        onClick: onOpenDashboard,
      },
      {
        id: "users",
        label: "Administración usuarios",
        visible: currentUser.role === "admin",
        active: false,
        onClick: onOpenUsers,
      },
    ],
    [
      canConfigureScore,
      canSeeCommissions,
      canSeeManagement,
      canSeeRadiography,
      currentUser.role,
      currentView,
      isCommercialUser,
      isHrUser,
      onFilterChange,
      onOpenCatalogs,
      onOpenCollections,
      onOpenCommercial,
      onOpenCommercialObjectives,
      onOpenCommissions,
      onOpenCreditAccounts,
      onOpenCustomersToSell,
      onOpenDashboard,
      onOpenMyTrip,
      onOpenPriceLists,
      onOpenScoreConfig,
      onOpenTripTracking,
      onOpenTrips,
      onOpenUsers,
    ]
  );

  const visibleItems = useMemo(() => menuItems.filter((item) => item.visible), [menuItems]);
  const defaultOrder = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);

  const [menuOrder, setMenuOrder] = useState(() => readSavedOrder(storageKey, defaultOrder));
  const [draggedId, setDraggedId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const normalizedOrder = useMemo(
    () => normalizeOrder(menuOrder, defaultOrder),
    [menuOrder, defaultOrder]
  );

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(normalizedOrder));
  }, [normalizedOrder, storageKey]);

  const orderedItems = useMemo(() => {
    const byId = new Map(visibleItems.map((item) => [item.id, item]));
    return normalizedOrder.map((id) => byId.get(id)).filter(Boolean);
  }, [normalizedOrder, visibleItems]);

  function reorderItem(sourceId, targetId, position = "before") {
    if (!sourceId || !targetId || sourceId === targetId) return;

    setMenuOrder((current) => {
      const orderedCurrent = normalizeOrder(current, defaultOrder);
      const withoutSource = orderedCurrent.filter((id) => id !== sourceId);
      const targetIndex = withoutSource.indexOf(targetId);
      if (targetIndex < 0) return current;

      const insertIndex = targetIndex + (position === "after" ? 1 : 0);
      const next = [...withoutSource];
      next.splice(insertIndex, 0, sourceId);
      return next;
    });
  }

  function handleDragOver(event, targetId) {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    setDropTarget({ id: targetId, position });
  }

  function handleDrop(event, targetId) {
    event.preventDefault();
    const position = dropTarget?.id === targetId ? dropTarget.position : "before";
    reorderItem(draggedId, targetId, position);
    setDraggedId(null);
    setDropTarget(null);
  }

  function moveWithKeyboard(itemId, direction) {
    const currentIndex = normalizedOrder.indexOf(itemId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= normalizedOrder.length) return;

    const next = [...normalizedOrder];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    setMenuOrder(next);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-main">
        <div className="sidebar-header">
          <div className="logo">GS</div>

          <div>
            <h2>Gestor</h2>

            <p>
              {currentUser.role === "vendedor" && "Comercial"}
              {currentUser.role === "cuentas" && "Cuentas Corrientes"}
              {currentUser.role === "supervisor" && "Supervisor Comercial"}
              {currentUser.role === "gerente" && "Gerencia Comercial"}
              {currentUser.role === "jefe" && "Jefe de ventas"}
              {currentUser.role === "admin" && "Administrador"}
              {currentUser.role === "rrhh" && "Recursos Humanos"}
            </p>
          </div>
        </div>

        <div className="sidebar-order-hint">
          <span className="sidebar-order-icon" aria-hidden="true">⋮⋮</span>
          Arrastrá las opciones para ordenar el menú
        </div>

        <nav className="sidebar-nav" aria-label="Módulos del SGI">
          {orderedItems.map((item) => {
            const isDropBefore = dropTarget?.id === item.id && dropTarget.position === "before";
            const isDropAfter = dropTarget?.id === item.id && dropTarget.position === "after";

            return (
              <div
                key={item.id}
                className={`sidebar-nav-item ${draggedId === item.id ? "dragging" : ""} ${isDropBefore ? "drop-before" : ""} ${isDropAfter ? "drop-after" : ""}`}
                onDragOver={(event) => handleDragOver(event, item.id)}
                onDrop={(event) => handleDrop(event, item.id)}
              >
                <span
                  className="sidebar-drag-handle"
                  draggable
                  tabIndex={0}
                  aria-label={`Mover ${item.label}. Usá las flechas arriba y abajo para cambiar su posición.`}
                  title="Arrastrar para cambiar de posición"
                  onDragStart={(event) => {
                    setDraggedId(item.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", item.id);
                  }}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDropTarget(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      moveWithKeyboard(item.id, -1);
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      moveWithKeyboard(item.id, 1);
                    }
                  }}
                >
                  ⋮⋮
                </span>
                <button className={item.active ? "active" : ""} onClick={item.onClick}>
                  {item.label}
                </button>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-user">
        <div>
          <strong>{currentUser.name}</strong>
          <p>{currentUser.email}</p>
        </div>

        <button onClick={onLogout}>Cerrar sesión</button>
      </div>
    </aside>
  );
}

export default Sidebar;
