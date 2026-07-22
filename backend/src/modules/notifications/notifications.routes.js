module.exports = function registerRoutes(context) {
  const { app, db, axios, queryOdoo, sendEmail, fireAndForget, emailTemplate, publicUser, getUserByName, getUsersByRole, emailUsersByRole, emailUserByName, emailCustomer, createNotification, addHistory, getRequestById, upload, uploadCollection, uploadsDir, mailEnabled } = context;

app.get("/api/notifications", (req, res) => {
  const { role, name } = req.query;

  const rows = db
    .prepare(`
      SELECT *
      FROM notifications
      WHERE userRole = ?
         OR userName = ?
      ORDER BY id DESC
    `)
    .all(role || "", name || "");

  res.json(rows);
});

app.patch("/api/notifications/:id/read", (req, res) => {
  const id = req.params.id;

  db.prepare(`
    UPDATE notifications
    SET isRead = 1
    WHERE id = ?
  `).run(id);

  const notification = db
    .prepare(`SELECT * FROM notifications WHERE id = ?`)
    .get(id);

  res.json(notification);
});

/* =========================
   SLA ALERTS
========================= */

app.post("/api/notifications/check-sla", (req, res) => {
  try {
    const openRequests = db
      .prepare(`
        SELECT *
        FROM requests
        WHERE status != 'Finalizada'
      `)
      .all();

    let created = 0;
    const now = new Date();

    for (const request of openRequests) {
      const createdDate = new Date(request.createdAt);
      const hours = Math.floor((now - createdDate) / 1000 / 60 / 60);

      if (hours >= 48) {
        const existing = db
          .prepare(`
            SELECT *
            FROM notifications
            WHERE requestId = ?
              AND title = ?
          `)
          .get(request.id, "Alerta SLA 48hs");

        if (!existing) {
          const title = "Alerta SLA 48hs";
          const message = `La solicitud #${request.id} de ${request.client} lleva ${hours} hs abierta.`;

          createNotification({
            userRole: "cuentas",
            requestId: request.id,
            title,
            message,
          });

          created += 1;

          fireAndForget(
            emailUsersByRole("cuentas", title, message, request.id),
            "Error email SLA:"
          );
        }
      }
    }

    res.json({ created });
  } catch (error) {
    console.error("Error check SLA:", error);
    res.status(500).json({
      error: "Error check SLA",
    });
  }
});



/* =========================
   TRIP CLOSURE SLA ALERTS
========================= */

app.post("/api/notifications/check-trip-alerts", (req, res) => {
  try {
    const trips = db
      .prepare(`
        SELECT *
        FROM trips
        WHERE end_date IS NOT NULL
          AND end_date != ''
          AND closed_at IS NULL
          AND COALESCE(status, 'Planificada') NOT IN ('Cerrada')
          AND date(end_date) < date('now')
      `)
      .all();

    let created = 0;
    const now = new Date();

    for (const trip of trips) {
      const endDate = new Date(trip.end_date);
      endDate.setHours(23, 59, 59, 999);

      const dueAt = new Date(endDate);
      dueAt.setDate(dueAt.getDate() + 3);

      const diffHours = Math.ceil(
        (dueAt.getTime() - now.getTime()) / 1000 / 60 / 60
      );

      const title =
        diffHours < 0
          ? "Gira vencida sin devolución"
          : "Gira pendiente de devolución";

      const message =
        diffHours < 0
          ? `La gira ${trip.nombre} venció hace ${Math.abs(diffHours)}hs y todavía no tiene devolución cargada.`
          : `La gira ${trip.nombre} finalizó y quedan ${diffHours}hs para cargar la devolución.`;

      const existing = db
        .prepare(`
          SELECT *
          FROM notifications
          WHERE requestId = ?
            AND userName = ?
            AND title = ?
        `)
        .get(trip.id, trip.asesor, title);

      if (existing) continue;

      createNotification({
        userName: trip.asesor,
        requestId: trip.id,
        title,
        message,
      });

      created += 1;

      if (emailUserByName && fireAndForget) {
        fireAndForget(
          emailUserByName(trip.asesor, title, message, trip.id),
          "Error email alerta gira:"
        );
      }
    }

    res.json({ created });
  } catch (error) {
    console.error("Error check trip alerts:", error);
    res.status(500).json({
      error: "Error check trip alerts",
    });
  }
});

/* =========================
   SERVER
========================= */
/* =========================
   GIRAS
========================= */

};
