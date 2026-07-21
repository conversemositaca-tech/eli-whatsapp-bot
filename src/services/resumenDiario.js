/**
 * Resumen diario de agenda para los terapeutas (integración con Itaca).
 *
 * Cada mañana (7am Lima por defecto), Eli consulta a Itaca la agenda del día de
 * TODOS los psicólogos con teléfono registrado y le escribe a cada uno la lista
 * de sus pacientes. Solo escribe a quienes tienen al menos una sesión (no hace
 * ruido a los que no atienden ese día).
 *
 * Config por entorno:
 *   RESUMEN_DIARIO_ENABLED  "false" para apagarlo (default: encendido)
 *   RESUMEN_DIARIO_HORA     hora Lima de envío, 0-23 (default: 7)
 */
const axios = require("axios");
const { enviarMensaje } = require("./evolution");

const ITACA_URL = (process.env.ITACA_API_URL || "").replace(/\/+$/, "");
const ITACA_TOKEN = process.env.ITACA_INTEGRACION_TOKEN || "";
const ENABLED = (process.env.RESUMEN_DIARIO_ENABLED || "").toLowerCase() !== "false";
const HORA_LIMA = Math.min(23, Math.max(0, parseInt(process.env.RESUMEN_DIARIO_HORA || "7", 10) || 7));

const itaca = axios.create({
  baseURL: ITACA_URL,
  headers: { "X-Integracion-Token": ITACA_TOKEN, "Content-Type": "application/json" },
  timeout: 25000,
});

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function armarMensaje(psico) {
  const lineas = psico.citas
    .map((c) => `• ${c.hora} — ${c.paciente}${c.modalidad === "virtual" ? " (virtual)" : ""}`)
    .join("\n");
  const n = psico.citas.length;
  return (
    `¡Buenos días, *${psico.nombre}*! ☀️\n\n` +
    `Hoy tienes *${n}* sesión(es) agendada(s):\n${lineas}\n\n` +
    `_Cualquier cambio lo ves en el sistema. Que tengas un lindo día 🌿_`
  );
}

/** Pide la agenda del día a Itaca y escribe a cada terapeuta con sesiones. */
async function enviarResumenDiario() {
  if (!ITACA_URL || !ITACA_TOKEN) {
    console.log("[RESUMEN] Integración con Itaca no configurada; no envío nada.");
    return { enviados: 0 };
  }
  const { data } = await itaca.get("/api/integraciones/resumen-dia/");
  const psicologos = (data && data.psicologos) || [];
  let enviados = 0;
  for (const p of psicologos) {
    if (!p.telefono || !p.citas || p.citas.length === 0) continue;
    try {
      await enviarMensaje(p.telefono, armarMensaje(p));
      enviados++;
      console.log(`[RESUMEN] Agenda del día enviada a ${p.nombre} (${p.telefono}): ${p.citas.length} sesión(es)`);
    } catch (e) {
      console.error(`[RESUMEN] Error enviando a ${p.nombre} (${p.telefono}): ${e.message}`);
    }
    await esperar(3000 + Math.random() * 3000); // pausa entre envíos (parecer humano)
  }
  if (!enviados) console.log("[RESUMEN] Nadie tiene sesiones hoy; no envié mensajes.");
  return { enviados };
}

// ── Scheduler — HORA_LIMA (UTC-5) cada día (mismo patrón que insightsAgent) ────
function msHastaProximoEnvio() {
  const ahora = new Date(Date.now() - 5 * 60 * 60 * 1000); // hora Lima
  const objetivo = new Date(ahora);
  objetivo.setUTCHours(HORA_LIMA, 0, 0, 0);
  if (ahora >= objetivo) objetivo.setUTCDate(objetivo.getUTCDate() + 1);
  return objetivo.getTime() - ahora.getTime();
}

function iniciarResumenDiario() {
  if (!ENABLED) {
    console.log("[RESUMEN] Desactivado por RESUMEN_DIARIO_ENABLED=false.");
    return;
  }
  const ms = msHastaProximoEnvio();
  console.log(`[RESUMEN] Próximo resumen de agenda en ${Math.round(ms / 60000)} min (${HORA_LIMA}:00 Lima)`);
  setTimeout(async () => {
    try {
      await enviarResumenDiario();
    } catch (e) {
      console.error("[RESUMEN] Error en el envío diario:", e.message);
    }
    iniciarResumenDiario(); // reprograma para mañana
  }, ms);
}

module.exports = { iniciarResumenDiario, enviarResumenDiario };
