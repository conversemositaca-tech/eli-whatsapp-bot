const path = require("path");
const express = require("express");
const webhookRouter = require("./routes/webhook");
const panelRouter = require("./routes/panel");
const errorHandler = require("./middleware/errorHandler");
const { iniciarFollowup, verificarYEnviarFollowups } = require("./services/followup");
const { iniciarResumenDiario, enviarResumenDiario } = require("./services/resumenDiario");
const { cargarEstadoInicial } = require("./services/handoff");

const app = express();

// Iniciar sistema de seguimiento automático de leads fríos
iniciarFollowup();

// Resumen diario de agenda a los terapeutas (7am Lima, vía Itaca)
iniciarResumenDiario();

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

// Trigger manual del resumen diario de agenda (para probar sin esperar las 7am).
app.all("/test-resumen-diario", (req, res) => {
  console.log("[RESUMEN] Trigger manual recibido");
  enviarResumenDiario().catch((err) =>
    console.error("[RESUMEN] Error en trigger manual:", err.message)
  );
  res.json({ status: "triggered", timestamp: new Date().toISOString() });
});

// Rutas principales
app.use("/webhook", webhookRouter);
app.use("/panel", panelRouter);

// Manejo de errores (debe ir al final)
app.use(errorHandler);

module.exports = app;
