const path = require("path");
const express = require("express");
const webhookRouter = require("./routes/webhook");
const panelRouter = require("./routes/panel");
const errorHandler = require("./middleware/errorHandler");
const { iniciarFollowup, verificarYEnviarFollowups } = require("./services/followup");
const { cargarEstadoInicial } = require("./services/handoff");

const app = express();

// Iniciar sistema de seguimiento automático de leads fríos
iniciarFollowup();

// Restaurar los chats que quedaron en atención humana antes de un redeploy
cargarEstadoInicial();

// Parsear JSON y formularios HTML
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (imágenes de followup, bienvenida, etc.)
app.use(express.static(path.join(__dirname, "..", "public")));

// Ruta de salud para verificar que el servidor está activo
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Trigger manual del followup — útil para testear sin esperar el tick de 15min/20s.
// Acepta GET y POST. Devuelve inmediato; el envío ocurre en background.
app.all("/test-followup", (req, res) => {
  console.log("[FOLLOWUP] Trigger manual recibido");
  verificarYEnviarFollowups().catch((err) =>
    console.error("[FOLLOWUP] Error en trigger manual:", err.message)
  );
  res.json({ status: "triggered", timestamp: new Date().toISOString() });
});

// Rutas principales
app.use("/webhook", webhookRouter);
app.use("/panel", panelRouter);

// Manejo de errores (debe ir al final)
app.use(errorHandler);

module.exports = app;
