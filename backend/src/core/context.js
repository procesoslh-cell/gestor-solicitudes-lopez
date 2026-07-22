require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");
const axios = require("axios");
const db = require("../db");
const { queryCache, makeCacheKey } = require("./cache");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const elapsed = Date.now() - startedAt;
    const slowMs = Number(process.env.HTTP_SLOW_LOG_MS || 1500);
    if (elapsed >= slowMs) {
      console.warn(`[HTTP lento] ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsed}ms`);
    }
  });
  next();
});

const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origen no permitido por CORS"));
    },
  })
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "10mb" }));

const PORT = process.env.PORT || 3001;
const PUBLIC_API_URL =
  process.env.PUBLIC_API_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`;

const uploadsDir = path.join(__dirname, "..", "..", "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use("/uploads", express.static(uploadsDir));

app.use(
  "/uploads/collections",
  express.static(path.join(uploadsDir, "collections"))
);

const odooPool = new Pool({
  host: process.env.ODOO_DB_HOST,
  port: Number(process.env.ODOO_DB_PORT || 5432),
  database: process.env.ODOO_DB_NAME,
  user: process.env.ODOO_DB_USER,
  password: process.env.ODOO_DB_PASSWORD,
  max: Number(process.env.ODOO_DB_POOL_MAX || 10),
  min: Number(process.env.ODOO_DB_POOL_MIN || 0),
  idleTimeoutMillis: Number(process.env.ODOO_DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.ODOO_DB_CONNECTION_TIMEOUT_MS || 8000),
  statement_timeout: Number(process.env.ODOO_DB_STATEMENT_TIMEOUT_MS || 45000),
  query_timeout: Number(process.env.ODOO_DB_QUERY_TIMEOUT_MS || 50000),
  ssl: process.env.ODOO_DB_SSL === "false"
    ? false
    : {
        rejectUnauthorized: false,
      },
});

async function queryOdoo(text, params = [], options = {}) {
  const startedAt = Date.now();
  const client = await odooPool.connect();

  try {
    const result = await client.query(text, params);
    const elapsed = Date.now() - startedAt;
    const slowMs = Number(process.env.ODOO_SLOW_QUERY_MS || 2500);
    if (elapsed >= slowMs) {
      console.warn(`[Odoo SQL lenta] ${options.label || "query"} ${elapsed}ms filas=${result.rowCount}`);
    }
    return result.rows;
  } finally {
    client.release();
  }
}

async function queryOdooCached(text, params = [], options = {}) {
  const ttlMs = Number(options.ttlMs || process.env.ODOO_QUERY_CACHE_TTL_MS || 60000);
  if (ttlMs <= 0 || process.env.ODOO_QUERY_CACHE_ENABLED === "false") {
    return queryOdoo(text, params, options);
  }

  const key = makeCacheKey([options.label || "odoo", text, params]);
  const cached = queryCache.get(key);
  if (cached) return cached;

  const rows = await queryOdoo(text, params, options);
  queryCache.set(key, rows, ttlMs);
  return rows;
}

const mailEnabled =
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS;

const transporter = mailEnabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

async function sendEmail({ to, subject, html }) {
  if (!mailEnabled || !to) {
    console.log("Email no enviado. Falta SMTP o destinatario.");
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });

    console.log("Email enviado a:", to);
  } catch (error) {
    console.error("Error enviando email:", error.message);
  }
}

function fireAndForget(promise, label) {
  Promise.resolve(promise).catch((error) => {
    console.error(label, error.message);
  });
}

function emailTemplate({ title, message, requestId }) {
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const link = requestId ? `${appUrl}?requestId=${requestId}` : appUrl;

  return `
    <div style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px;">
      <div style="max-width:680px;margin:auto;background:white;border-radius:18px;padding:26px;">
        <h2 style="color:#0f172a;margin-top:0;">${title}</h2>
        <p style="color:#334155;font-size:15px;line-height:1.5;">${message}</p>
        ${
          requestId
            ? `<a href="${link}" style="display:inline-block;background:#2563eb;color:white;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:bold;">Ver solicitud</a>`
            : ""
        }
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="font-size:12px;color:#64748b;">Gestor de Solicitudes · López Hnos</p>
      </div>
    </div>
  `;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `${Date.now()}-${cleanName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

const collectionStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadsDir, "collections");

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    cb(null, dir);
  },

  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + file.originalname;

    cb(null, unique);
  },
});

const uploadCollection = multer({
  storage: collectionStorage,
});

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    business_unit: user.business_unit,
    supervisor_id: user.supervisor_id,
    odoo_user_id: user.odoo_user_id,
  };
}

function getUserByName(name) {
  return db
    .prepare(`
      SELECT *
      FROM users
      WHERE name = ?
        AND active = 1
    `)
    .get(name);
}

function getUsersByRole(role) {
  return db
    .prepare(`
      SELECT *
      FROM users
      WHERE role = ?
        AND active = 1
        AND email IS NOT NULL
        AND email != ''
    `)
    .all(role);
}

async function emailUsersByRole(role, subject, message, requestId) {
  const users = getUsersByRole(role);

  for (const user of users) {
    await sendEmail({
      to: user.email,
      subject,
      html: emailTemplate({ title: subject, message, requestId }),
    });
  }

  if (users.length === 0 && role === "cuentas" && process.env.CC_EMAIL) {
    await sendEmail({
      to: process.env.CC_EMAIL,
      subject,
      html: emailTemplate({ title: subject, message, requestId }),
    });
  }
}

async function emailUserByName(name, subject, message, requestId){
  const user = getUserByName(name);

  if (!user || !user.email) return;

  await sendEmail({
    to: user.email,
    subject,
    html: emailTemplate({ title: subject, message, requestId }),
  });
}async function emailCustomer({ request, subject, message }) {
  if (!request?.email) {
    console.log("Cliente sin email cargado.");
    return;
  }

  await sendEmail({
    to: request.email,
    subject,
    html: emailTemplate({
      title: subject,
      message,
      requestId: null,
    }),
  });
}

function createNotification({
  userRole = "",
  userName = "",
  requestId,
  title,
  message,
}) {
  db.prepare(`
    INSERT INTO notifications (
      userRole,
      userName,
      requestId,
      title,
      message,
      isRead,
      createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userRole,
    userName,
    requestId,
    title,
    message,
    0,
    new Date().toLocaleString()
  );
}

function addHistory(requestId, user, action) {
  db.prepare(`
    INSERT INTO history (
      requestId,
      user,
      action,
      createdAt
    )
    VALUES (?, ?, ?, ?)
  `).run(
    requestId,
    user || "Sistema",
    action,
    new Date().toLocaleString()
  );
}

function getRequestById(id) {
  const request = db
    .prepare(`SELECT * FROM requests WHERE id = ?`)
    .get(id);

  if (!request) return null;

  const comments = db
    .prepare(`
      SELECT *
      FROM comments
      WHERE requestId = ?
      ORDER BY id DESC
    `)
    .all(id);

  const history = db
    .prepare(`
      SELECT *
      FROM history
      WHERE requestId = ?
      ORDER BY id DESC
    `)
    .all(id);

  const files = db
    .prepare(`
      SELECT *
      FROM request_files
      WHERE requestId = ?
      ORDER BY id DESC
    `)
    .all(id);

  return {
    ...request,
    comments,
    history,
    files,
  };
}

/* =========================
   HEALTH / PERFORMANCE
========================= */

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "gestor-backend", uptime: Math.round(process.uptime()) });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "gestor-backend",
    uptime: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    cache: queryCache.snapshot(),
    odooPool: {
      totalCount: odooPool.totalCount,
      idleCount: odooPool.idleCount,
      waitingCount: odooPool.waitingCount,
    },
  });
});

app.get("/api/health/deep", async (req, res) => {
  const startedAt = Date.now();
  try {
    await queryOdoo("SELECT 1 AS ok", [], { label: "health_deep", ttlMs: 0 });
    res.json({ ok: true, odoo: true, elapsedMs: Date.now() - startedAt });
  } catch (error) {
    res.status(503).json({ ok: false, odoo: false, error: error.message, elapsedMs: Date.now() - startedAt });
  }
});

app.post("/api/admin/cache/clear", (req, res) => {
  const role = String(req.body?.role || req.query.role || "");
  if (role !== "admin") return res.status(403).json({ error: "Solo administrador." });
  const cleared = queryCache.clear();
  res.json({ ok: true, cleared, cache: queryCache.snapshot() });
});

module.exports = {
  app,
  db,
  axios,
  queryOdoo,
  queryOdooCached,
  queryCache,
  odooPool,
  sendEmail,
  fireAndForget,
  emailTemplate,
  publicUser,
  getUserByName,
  getUsersByRole,
  emailUsersByRole,
  emailUserByName,
  emailCustomer,
  createNotification,
  addHistory,
  getRequestById,
  upload,
  uploadCollection,
  uploadsDir,
  mailEnabled,
};
