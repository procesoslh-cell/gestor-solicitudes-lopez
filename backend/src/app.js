const initializeDatabase = require("./db/schema");
const context = require("./core/context");

initializeDatabase();

context.app.get("/", (req, res) => {
  res.send("Gestor operativo");
});

require("./modules/odoo/odoo.routes")(context);
require("./modules/email/email.routes")(context);
require("./modules/auth/auth.routes")(context);
require("./modules/users/users.routes")(context);
require("./modules/requests/requests.routes")(context);
require("./modules/notifications/notifications.routes")(context);
require("./modules/trips/trips.routes")(context);
require("./modules/dashboard/dashboard.routes")(context);
require("./modules/collections/collections.routes")(context);
require("./modules/credit/credit.routes")(context);
require("./modules/commercial-objectives.routes")(context);
require("./modules/commissions/commissions.routes")(context);
require("./modules/price-lists/price-lists.routes")(context);
require("./modules/catalogs/catalogs.routes")(context);

module.exports = context.app;


/* =========================
   ERROR HANDLER PRODUCCION V8
========================= */
context.app.use((err, req, res, next) => {
  console.error("ERROR NO CONTROLADO:", err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production" ? "Error interno del servidor" : err.message,
  });
});
