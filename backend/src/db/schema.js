const db = require("./index");

function initializeDatabase() {
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT,
  name TEXT,
  email TEXT,
  role TEXT,
  active INTEGER DEFAULT 1,
  createdAt TEXT
)
`).run();
try {
  db.prepare(`
    ALTER TABLE users
    ADD COLUMN odoo_user_id INTEGER
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE users
    ADD COLUMN supervisor_id INTEGER
  `).run();
} catch {}
db.prepare(`
  CREATE TABLE IF NOT EXISTS collection_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER,
    filename TEXT,
    original_name TEXT,
    uploaded_at TEXT
  )
`).run();
try {
  db.prepare(`
    ALTER TABLE users
    ADD COLUMN business_unit TEXT
  `).run();
} catch {}
db.prepare(`
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,
  client TEXT,
  requester TEXT,
  area TEXT,
  priority TEXT,
  status TEXT,
  dueDate TEXT,
  createdAt TEXT,
  fantasyName TEXT,
  businessName TEXT,
  cuit TEXT,
  email TEXT,
  mobile TEXT,
  storeAddress TEXT,
  deliveryAddress TEXT,
  postalCodeCity TEXT,
  description TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requestId INTEGER,
  author TEXT,
  comment TEXT,
  createdAt TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requestId INTEGER,
  user TEXT,
  action TEXT,
  createdAt TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS request_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requestId INTEGER,
  category TEXT,
  originalName TEXT,
  filename TEXT,
  url TEXT,
  uploadedAt TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userRole TEXT,
  userName TEXT,
  requestId INTEGER,
  title TEXT,
  message TEXT,
  isRead INTEGER DEFAULT 0,
  createdAt TEXT
)
`).run();
/* =========================
   GIRAS COMERCIALES
========================= */

db.prepare(`
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asesor_id INTEGER,
  asesor TEXT,
  nombre TEXT,
  mes TEXT,
  observaciones TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT,
  result_orders_count INTEGER,
  result_estimated_amount REAL,
  result_notes TEXT,
  closed_at TEXT,
  supervisor_status TEXT,
  supervisor_comments TEXT,
  supervisor_reviewed_by TEXT,
  supervisor_reviewed_at TEXT,
  route_start_name TEXT,
  route_start_lat REAL,
  route_start_lng REAL,
  route_return_to_start INTEGER DEFAULT 1,
  route_total_km REAL,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS trip_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER,
  cliente_id INTEGER,
  cliente TEXT,
  estado TEXT,

  partner_latitude REAL,
  partner_longitude REAL,
  direccion TEXT,
  localidad TEXT,
  provincia TEXT,
  codigo_postal TEXT,
  address_partner_id INTEGER,
  address_label TEXT,
  address_type TEXT,
  geocode_status TEXT,
  geocode_source TEXT,
  geocode_query TEXT,
  geocoded_at TEXT,
  objetivo TEXT,
  prioridad TEXT,
  source TEXT,
  created_by TEXT,
  created_at TEXT,
  visit_order INTEGER,
  visit_status TEXT,
  visit_comment TEXT,
  visited_at TEXT,
  visited_lat REAL,
  visited_lng REAL,
  visit_started_at TEXT,
  visit_start_lat REAL,
  visit_start_lng REAL,
  visit_result TEXT,
  visit_photo_url TEXT,
  visit_distance_meters REAL
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS trip_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER,
  cliente_id INTEGER,
  comentario TEXT,
  lat REAL,
  lng REAL,
  visitado_at TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS trip_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER,
  asesor_id INTEGER,
  asesor TEXT,
  trip_client_id INTEGER,
  cliente_id INTEGER,
  cliente TEXT,
  event_type TEXT,
  lat REAL,
  lng REAL,
  accuracy REAL,
  distance_meters REAL,
  result TEXT,
  comment TEXT,
  photo_url TEXT,
  created_at TEXT
)
`).run();

/* =========================
   GIRAS - MIGRACIONES
========================= */

[
  ["trips", "start_date", "TEXT"],
  ["trips", "end_date", "TEXT"],
  ["trips", "status", "TEXT"],
  ["trips", "result_orders_count", "INTEGER"],
  ["trips", "result_estimated_amount", "REAL"],
  ["trips", "result_notes", "TEXT"],
  ["trips", "closed_at", "TEXT"],
  ["trips", "supervisor_status", "TEXT"],
  ["trips", "supervisor_comments", "TEXT"],
  ["trips", "supervisor_reviewed_by", "TEXT"],
  ["trips", "supervisor_reviewed_at", "TEXT"],
  ["trips", "route_start_name", "TEXT"],
  ["trips", "route_start_lat", "REAL"],
  ["trips", "route_start_lng", "REAL"],
  ["trips", "route_return_to_start", "INTEGER DEFAULT 1"],
  ["trips", "route_total_km", "REAL"],
  ["trips", "started_at", "TEXT"],
  ["trips", "finished_at", "TEXT"]
].forEach(([table, column, type]) => {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  } catch {}
});

/* =========================
   COBRANZAS
========================= */

db.prepare(`
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  cliente_id INTEGER,
  cliente TEXT,

  asesor_id INTEGER,
  asesor TEXT,

  total REAL,

  payment_method TEXT,
  status TEXT,

  notes TEXT,

  receipt_number TEXT,

  created_at TEXT,
  validated_at TEXT,
  validated_by TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS collection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  collection_id INTEGER,

  invoice_id INTEGER,
  invoice_number TEXT,

  amount REAL
)
`).run();

/* =========================
   CUENTA CLIENTE / SCORE CREDITICIO
========================= */

db.prepare(`
CREATE TABLE IF NOT EXISTS credit_score_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  description TEXT,
  base_score INTEGER DEFAULT 1000,
  is_active INTEGER DEFAULT 1,
  payload TEXT,
  created_at TEXT,
  updated_at TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS credit_score_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER,
  cliente TEXT,
  score INTEGER,
  status TEXT,
  recommendation TEXT,
  payload TEXT,
  created_at TEXT
)
`).run();


db.prepare(`
CREATE TABLE IF NOT EXISTS bcra_consultas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER,
  identificacion TEXT,
  status TEXT,
  summary TEXT,
  deudas_payload TEXT,
  historicas_payload TEXT,
  cheques_payload TEXT,
  error_message TEXT,
  source TEXT,
  consulted_at TEXT
)
`).run();

try {
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_bcra_consultas_cliente ON bcra_consultas(cliente_id, consulted_at)`).run();
} catch {}

try {
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_bcra_consultas_identificacion ON bcra_consultas(identificacion, consulted_at)`).run();
} catch {}

db.prepare(`
CREATE TABLE IF NOT EXISTS bcra_bulk_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT,
  executed_by TEXT,
  filters_payload TEXT,
  total INTEGER DEFAULT 0,
  consulted INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  invalid INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  observed INTEGER DEFAULT 0,
  created_at TEXT,
  finished_at TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS credit_manual_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER,
  cliente TEXT,
  flag_type TEXT,
  status TEXT,
  reason TEXT,
  created_by TEXT,
  created_at TEXT,
  resolved_by TEXT,
  resolved_at TEXT
)
`).run();

/* =========================
   INITIAL USERS
========================= */

function ensureUser({ username, password, name, email, role }) {
  const existing = db
    .prepare(`SELECT * FROM users WHERE username = ?`)
    .get(username);

  if (existing) return;

  db.prepare(`
    INSERT INTO users (
      username, password, name, email, role, active, createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    username,
    password,
    name,
    email,
    role,
    1,
    new Date().toISOString()
  );
}

ensureUser({
  username: "fabian",
  password: "1234",
  name: "Fabian Ramos",
  email: "fabianramos@lopezhnos.com.ar",
  role: "vendedor",
});

ensureUser({
  username: "cuentas",
  password: "1234",
  name: "Cuentas Corrientes",
  email: process.env.CC_EMAIL || "cuentas@lopezhnos.com.ar",
  role: "cuentas",
});

ensureUser({
  username: "admin",
  password: "1234",
  name: "Administrador",
  email: "admin@lopezhnos.com.ar",
  role: "admin",
});
try {
  db.prepare(`
    ALTER TABLE trips
    ADD COLUMN closed_at TEXT
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE trips
    ADD COLUMN result_orders_count INTEGER
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE trips
    ADD COLUMN result_estimated_amount REAL
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE trips
    ADD COLUMN result_notes TEXT
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE trip_clients
    ADD COLUMN visit_status TEXT
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE trip_clients
    ADD COLUMN visit_comment TEXT
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE trip_clients
    ADD COLUMN visited_at TEXT
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE trip_clients
    ADD COLUMN visited_lat REAL
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE trip_clients
    ADD COLUMN visited_lng REAL
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE trip_clients
    ADD COLUMN partner_latitude REAL
  `).run();
} catch {}

try {
  db.prepare(`
    ALTER TABLE trip_clients
    ADD COLUMN partner_longitude REAL
  `).run();
} catch {}

[
  ["objetivo", "TEXT"],
  ["prioridad", "TEXT"],
  ["source", "TEXT"],
  ["created_by", "TEXT"],
  ["created_at", "TEXT"],
  ["visit_order", "INTEGER"],
  ["direccion", "TEXT"],
  ["localidad", "TEXT"],
  ["provincia", "TEXT"],
  ["codigo_postal", "TEXT"],
  ["address_partner_id", "INTEGER"],
  ["address_label", "TEXT"],
  ["address_type", "TEXT"],
  ["geocode_status", "TEXT"],
  ["geocode_source", "TEXT"],
  ["geocode_query", "TEXT"],
  ["geocoded_at", "TEXT"],
  ["visit_started_at", "TEXT"],
  ["visit_start_lat", "REAL"],
  ["visit_start_lng", "REAL"],
  ["visit_result", "TEXT"],
  ["visit_photo_url", "TEXT"],
  ["visit_distance_meters", "REAL"]
].forEach(([column, type]) => {
  try {
    db.prepare(`ALTER TABLE trip_clients ADD COLUMN ${column} ${type}`).run();
  } catch {}
});
try {
  db.prepare(`
    ALTER TABLE collections
    ADD COLUMN observation_reason TEXT
  `).run();
} catch {}
/* =========================
   DASHBOARD COMERCIAL
========================= */



/* =========================
   MIGRACIONES AUXILIARES
========================= */

function addColumnIfMissing(table, column, definition) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  } catch {}
}

addColumnIfMissing("collections", "observation_reason", "TEXT");


  /* =========================
     INDICES PRODUCCION V8
  ========================= */
  function createIndexIfPossibleV8(sql) {
    try { db.prepare(sql).run(); } catch (error) {}
  }

  [
    "CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, active)",
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
    "CREATE INDEX IF NOT EXISTS idx_users_odoo_user_id ON users(odoo_user_id)",
    "CREATE INDEX IF NOT EXISTS idx_requests_status_type ON requests(status, type)",
    "CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester)",
    "CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(createdAt)",
    "CREATE INDEX IF NOT EXISTS idx_comments_request ON comments(requestId)",
    "CREATE INDEX IF NOT EXISTS idx_history_request ON history(requestId)",
    "CREATE INDEX IF NOT EXISTS idx_request_files_request ON request_files(requestId)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(userRole, userName, isRead)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(createdAt)",
    "CREATE INDEX IF NOT EXISTS idx_trips_asesor_status ON trips(asesor_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_trips_dates ON trips(start_date, end_date)",
    "CREATE INDEX IF NOT EXISTS idx_trip_clients_trip ON trip_clients(trip_id)",
    "CREATE INDEX IF NOT EXISTS idx_trip_clients_cliente ON trip_clients(cliente_id)",
    "CREATE INDEX IF NOT EXISTS idx_trip_tracking_trip_created ON trip_tracking(trip_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_trip_tracking_asesor_created ON trip_tracking(asesor_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_collections_client ON collections(client)",
    "CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(status)",
    "CREATE INDEX IF NOT EXISTS idx_credit_bcra_client ON credit_bcra_queries(cliente_id)",
    "CREATE INDEX IF NOT EXISTS idx_credit_bcra_cuit ON credit_bcra_queries(cuit)",
    "CREATE INDEX IF NOT EXISTS idx_credit_bcra_created ON credit_bcra_queries(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_credit_score_policy_active ON credit_score_policies(is_active)",
    "CREATE INDEX IF NOT EXISTS idx_commercial_objectives_advisor ON commercial_objectives(advisor_id, period)",
    "CREATE INDEX IF NOT EXISTS idx_commercial_objectives_unit_period ON commercial_objectives(unit, period)"
  ].forEach(createIndexIfPossibleV8);

  console.log("Database initialized");
}

module.exports = initializeDatabase;


/* =========================
   OBJETIVOS COMERCIALES V6
========================= */
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS commercial_objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT,
      unit TEXT,
      category TEXT,
      advisor_id INTEGER,
      advisor_name TEXT,
      amount REAL DEFAULT 0,
      status TEXT DEFAULT 'Publicado',
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(period, unit, category, advisor_id)
    )
  `).run();
} catch {}

[
  ["commercial_objectives", "period", "TEXT"],
  ["commercial_objectives", "unit", "TEXT"],
  ["commercial_objectives", "category", "TEXT"],
  ["commercial_objectives", "advisor_id", "INTEGER"],
  ["commercial_objectives", "advisor_name", "TEXT"],
  ["commercial_objectives", "amount", "REAL DEFAULT 0"],
  ["commercial_objectives", "status", "TEXT DEFAULT 'Publicado'"],
  ["commercial_objectives", "created_by", "TEXT"],
  ["commercial_objectives", "updated_by", "TEXT"],
  ["commercial_objectives", "created_at", "TEXT"],
  ["commercial_objectives", "updated_at", "TEXT"]
].forEach(([table, column, type]) => {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  } catch {}
});

try {
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_commercial_objectives_period_unit ON commercial_objectives(period, unit)`).run();
} catch {}


/* =========================
   INDICES PRODUCCION V8
   Mejoran consultas frecuentes de solicitudes, notificaciones,
   giras, score, BCRA, objetivos y listas/configuración local.
========================= */
function createIndexIfPossible(sql) {
  try {
    db.prepare(sql).run();
  } catch (error) {
    // Algunas tablas pueden no existir en instalaciones antiguas. No bloquear inicio.
  }
}

[
  "CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, active)",
  "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
  "CREATE INDEX IF NOT EXISTS idx_users_odoo_user_id ON users(odoo_user_id)",
  "CREATE INDEX IF NOT EXISTS idx_requests_status_type ON requests(status, type)",
  "CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester)",
  "CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(createdAt)",
  "CREATE INDEX IF NOT EXISTS idx_comments_request ON comments(requestId)",
  "CREATE INDEX IF NOT EXISTS idx_history_request ON history(requestId)",
  "CREATE INDEX IF NOT EXISTS idx_request_files_request ON request_files(requestId)",
  "CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(userRole, userName, isRead)",
  "CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(createdAt)",
  "CREATE INDEX IF NOT EXISTS idx_trips_asesor_status ON trips(asesor_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_trips_dates ON trips(start_date, end_date)",
  "CREATE INDEX IF NOT EXISTS idx_trip_clients_trip ON trip_clients(trip_id)",
  "CREATE INDEX IF NOT EXISTS idx_trip_clients_cliente ON trip_clients(cliente_id)",
  "CREATE INDEX IF NOT EXISTS idx_trip_tracking_trip_created ON trip_tracking(trip_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_trip_tracking_asesor_created ON trip_tracking(asesor_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_collections_client ON collections(client)",
  "CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(status)",
  "CREATE INDEX IF NOT EXISTS idx_credit_bcra_client ON credit_bcra_queries(cliente_id)",
  "CREATE INDEX IF NOT EXISTS idx_credit_bcra_cuit ON credit_bcra_queries(cuit)",
  "CREATE INDEX IF NOT EXISTS idx_credit_bcra_created ON credit_bcra_queries(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_credit_score_policy_active ON credit_score_policies(is_active)",
  "CREATE INDEX IF NOT EXISTS idx_commercial_objectives_advisor ON commercial_objectives(advisor_id, period)",
  "CREATE INDEX IF NOT EXISTS idx_commercial_objectives_unit_period ON commercial_objectives(unit, period)"
].forEach(createIndexIfPossible);

/* =========================
   CATALOGOS COMERCIALES V8.5
========================= */
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS catalog_visual_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_key TEXT UNIQUE,
      title TEXT,
      subtitle TEXT,
      campaign_text TEXT,
      validity_text TEXT,
      cover_image_url TEXT,
      banner_image_url TEXT,
      logo_url TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      page_background_color TEXT DEFAULT '#eef2f7',
      card_background_color TEXT DEFAULT '#ffffff',
      text_color TEXT DEFAULT '#0f172a',
      print_orientation TEXT DEFAULT 'portrait',
      card_style TEXT DEFAULT 'modern',
      show_prices INTEGER DEFAULT 0,
      show_cash_price INTEGER DEFAULT 0,
      show_stock INTEGER DEFAULT 1,
      stock_only INTEGER DEFAULT 1,
      published_only INTEGER DEFAULT 1,
      show_category_banner INTEGER DEFAULT 1,
      show_subcategory_banner INTEGER DEFAULT 1,
      only_with_image INTEGER DEFAULT 1,
      footer_text TEXT,
      updated_by TEXT,
      updated_at TEXT
    )
  `).run();
} catch {}

try {
  db.prepare(`ALTER TABLE catalog_visual_configs ADD COLUMN published_only INTEGER DEFAULT 1`).run();
} catch {}

[
  `ALTER TABLE catalog_visual_configs ADD COLUMN page_background_color TEXT DEFAULT '#eef2f7'`,
  `ALTER TABLE catalog_visual_configs ADD COLUMN card_background_color TEXT DEFAULT '#ffffff'`,
  `ALTER TABLE catalog_visual_configs ADD COLUMN text_color TEXT DEFAULT '#0f172a'`,
  `ALTER TABLE catalog_visual_configs ADD COLUMN print_orientation TEXT DEFAULT 'portrait'`,
  `ALTER TABLE catalog_visual_configs ADD COLUMN show_category_banner INTEGER DEFAULT 1`,
  `ALTER TABLE catalog_visual_configs ADD COLUMN show_subcategory_banner INTEGER DEFAULT 1`
].forEach((sql) => {
  try { db.prepare(sql).run(); } catch {}
});

try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS catalog_subcategory_banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_key TEXT NOT NULL,
      subcategory TEXT NOT NULL,
      image_url TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT,
      UNIQUE(base_key, subcategory)
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_catalog_subcategory_banners_base ON catalog_subcategory_banners(base_key)`).run();
} catch {}

try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS catalog_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_key TEXT,
      list_key TEXT,
      title TEXT,
      filters_payload TEXT,
      config_payload TEXT,
      product_count INTEGER DEFAULT 0,
      source TEXT,
      generated_by TEXT,
      generated_at TEXT,
      filename TEXT
    )
  `).run();
} catch {}

try {
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_catalog_generations_date ON catalog_generations(generated_at)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_catalog_generations_base ON catalog_generations(base_key, generated_at)`).run();
} catch {}

/* =========================
   LIQUIDACION DE COMISIONES V8.9
========================= */
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS commission_schemes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      valid_from TEXT,
      valid_to TEXT,
      status TEXT DEFAULT 'Borrador',
      description TEXT,
      rules_json TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT,
      updated_by TEXT,
      updated_at TEXT,
      activated_by TEXT,
      activated_at TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS commission_liquidations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL,
      unit TEXT NOT NULL,
      advisor_id INTEGER,
      advisor_name TEXT NOT NULL,
      scheme_id INTEGER NOT NULL,
      scheme_name TEXT,
      scheme_version INTEGER,
      status TEXT DEFAULT 'Borrador',
      objective_total REAL DEFAULT 0,
      sales_total REAL DEFAULT 0,
      fulfillment_total REAL DEFAULT 0,
      clients_sold INTEGER DEFAULT 0,
      clients_objective REAL DEFAULT 0,
      collections_total REAL DEFAULT 0,
      base_commission REAL DEFAULT 0,
      adjustments_total REAL DEFAULT 0,
      final_total REAL DEFAULT 0,
      metrics_json TEXT,
      calculation_json TEXT,
      source_snapshot_json TEXT,
      created_by TEXT,
      created_at TEXT,
      updated_by TEXT,
      updated_at TEXT,
      submitted_by TEXT,
      submitted_at TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_observation TEXT,
      locked_at TEXT,
      UNIQUE(period, unit, advisor_id, scheme_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS commission_liquidation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      liquidation_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      category TEXT,
      channel TEXT,
      concept TEXT NOT NULL,
      base_amount REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      quantity REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      source_ref TEXT,
      source_payload TEXT,
      created_at TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS commission_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      liquidation_id INTEGER NOT NULL,
      adjustment_type TEXT NOT NULL,
      concept TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_by TEXT,
      created_at TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS commission_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      liquidation_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      comments TEXT,
      user_name TEXT,
      user_role TEXT,
      created_at TEXT
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_commission_schemes_unit_status ON commission_schemes(unit, status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_commission_liquidations_period_unit ON commission_liquidations(period, unit)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_commission_liquidations_status ON commission_liquidations(status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_commission_items_liquidation ON commission_liquidation_items(liquidation_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_commission_adjustments_liquidation ON commission_adjustments(liquidation_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_commission_history_liquidation ON commission_history(liquidation_id, created_at)`).run();

  const existingSchemes = db.prepare(`SELECT COUNT(*) AS total FROM commission_schemes`).get();
  if (!existingSchemes || Number(existingSchemes.total || 0) === 0) {
    const insertScheme = db.prepare(`
      INSERT INTO commission_schemes (
        name, unit, version, valid_from, valid_to, status, description,
        rules_json, created_by, created_at, updated_by, updated_at
      ) VALUES (?, ?, 1, ?, NULL, 'Borrador', ?, ?, 'Sistema', datetime('now'), 'Sistema', datetime('now'))
    `);

    insertScheme.run(
      'Modelo inicial Ciclismo',
      'ciclismo',
      new Date().toISOString().slice(0, 7),
      'Esquema inicial tomado del modelo Excel. Debe ser revisado y activado por Comercial.',
      JSON.stringify({
        sales: {
          bicicletas: { mostrador: 1.0, distribuidor: 0.5 },
          bicipartes: { mostrador: 2.0, distribuidor: 1.2 }
        },
        collections: [
          { method: 'Efectivo', rate: 0.25 },
          { method: 'Cheque', rate: 0.20 }
        ],
        reach: {
          bicicletas: [
            { minPct: 80, rate: 0.10 }, { minPct: 90, rate: 0.15 },
            { minPct: 100, rate: 0.30 }, { minPct: 120, rate: 0.40 },
            { minPct: 150, rate: 0.50 }
          ],
          bicipartes: [
            { minPct: 90, rate: 0.15 }, { minPct: 100, rate: 0.30 },
            { minPct: 110, rate: 0.40 }, { minPct: 150, rate: 0.50 }
          ]
        },
        clients: [
          { minClients: 30, amount: 400000 },
          { minClients: 42, amount: 550000 },
          { minClients: 50, amount: 700000 }
        ],
        multipliers: [],
        penaltyDefaultRate: 2,
        notes: 'Los multiplicadores y disparadores de penalización deben definirse antes de activar.'
      })
    );

    insertScheme.run(
      'Modelo inicial Motociclismo',
      'motociclismo',
      new Date().toISOString().slice(0, 7),
      'Esquema inicial tomado del modelo Excel. Debe ser revisado y activado por Comercial.',
      JSON.stringify({
        sales: {
          mix: { mostrador: 2.0, distribuidor: 1.0 },
          neumaticos: { mostrador: 1.2, distribuidor: 0.5 }
        },
        collections: [
          { method: 'Efectivo', rate: 0.25 },
          { method: 'Cheque', rate: 0.20 }
        ],
        reach: {
          mix: [
            { minPct: 70, rate: 0.10 }, { minPct: 80, rate: 0.20 },
            { minPct: 90, rate: 0.30 }, { minPct: 100, rate: 0.40 },
            { minPct: 120, rate: 0.60 }
          ],
          neumaticos: [
            { minPct: 70, rate: 0.10 }, { minPct: 80, rate: 0.20 },
            { minPct: 90, rate: 0.30 }, { minPct: 100, rate: 0.40 },
            { minPct: 120, rate: 0.60 }
          ]
        },
        clients: [
          { minClients: 30, amount: 400000 },
          { minClients: 40, amount: 550000 },
          { minClients: 50, amount: 700000 }
        ],
        multipliers: [],
        penaltyDefaultRate: 2,
        notes: 'Los multiplicadores y disparadores de penalización deben definirse antes de activar.'
      })
    );
  }
} catch (error) {
  console.error('No se pudo inicializar Liquidación de Comisiones:', error.message);
}
