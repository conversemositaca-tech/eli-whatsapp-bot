const { enviarMensaje } = require("../services/wa");

// ── Almacén diario en memoria ────────────────────────────────────────────────
// Se resetea después de enviar el resumen. Si el proceso se reinicia se pierde
// el acumulado del día — aceptable para un resumen diario.
let registrosDia = [];

/**
 * Registra una conversación procesada para incluirla en el resumen diario.
 * Llamar al final de procesarMensajesAcumulados, antes de finalizar.
 *
 * @param {object} datos
 * @param {string} datos.telefono
 * @param {string|null} datos.ciudad     - "Piura" | "Lima" | "Virtual" | null
 * @param {string|null} datos.motivo
 * @param {boolean} datos.tieneDNI       - true si ya capturó el DNI
 * @param {boolean} datos.esCrisis
 * @param {string} datos.etapa           - etapa final de la conversación
 * @param {boolean} [datos.esFiltrado]   - true si fue bloqueado por FiltroTopico
 * @param {string} [datos.tipoFiltro]    - "spam" | "numero_equivocado"
 */
function registrarConversacion(datos) {
  registrosDia.push({ ...datos, timestamp: Date.now() });
}

// ── Generación del resumen ───────────────────────────────────────────────────

function formatearFecha() {
  const dias   = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses  = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  // Lima = UTC-5
  const ahora = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return `${dias[ahora.getUTCDay()]} ${ahora.getUTCDate()} de ${meses[ahora.getUTCMonth()]}`;
}

function contarMotivos(registros) {
  const conteo = {};
  for (const r of registros) {
    if (!r.motivo) continue;
    const clave = r.motivo.toLowerCase().slice(0, 30);
    conteo[clave] = (conteo[clave] || 0) + 1;
  }
  return Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([m, n]) => `  • ${m} (${n})`)
    .join("\n");
}

function construirMensaje(ciudad, registros, filtrados) {
  const reales    = registros.filter(r => !r.esFiltrado);
  const conDNI    = reales.filter(r => r.tieneDNI);
  const sinDNI    = reales.filter(r => !r.tieneDNI);
  const crisis    = reales.filter(r => r.esCrisis);
  const spams     = filtrados.filter(r => r.tipoFiltro === "spam");
  const equivoc   = filtrados.filter(r => r.tipoFiltro === "numero_equivocado");
  const motivos   = contarMotivos(reales);

  const lineas = [
    `📊 *Resumen del día — Ítaca ${ciudad}*`,
    `📅 ${formatearFecha()}`,
    "",
    `*Conversaciones nuevas:* ${reales.length}`,
    `*Leads listos (con DNI):* ${conDNI.length}`,
    `*En proceso (sin DNI):* ${sinDNI.length}`,
  ];

  if (crisis.length > 0) {
    lineas.push(`⚠️ *Crisis detectadas:* ${crisis.length}`);
  }
  if (spams.length > 0 || equivoc.length > 0) {
    lineas.push(`🚫 *Bloqueados:* ${spams.length} spam, ${equivoc.length} número equivocado`);
  }
  if (motivos) {
    lineas.push("", "*Motivos frecuentes:*", motivos);
  }

  if (reales.length === 0) {
    lineas.push("", "_Sin conversaciones hoy._");
  }

  return lineas.join("\n");
}

async function generarYEnviarResumen() {
  if (registrosDia.length === 0) {
    console.log("[INSIGHTS] Sin registros hoy, no se envía resumen.");
    registrosDia = [];
    return;
  }

  const filtrados = registrosDia.filter(r => r.esFiltrado);
  const piura     = registrosDia.filter(r => !r.esFiltrado && r.ciudad === "Piura");
  const lima      = registrosDia.filter(r => !r.esFiltrado && r.ciudad === "Lima");
  const virtual   = registrosDia.filter(r => !r.esFiltrado && r.ciudad === "Virtual");
  const sinCiudad = registrosDia.filter(r => !r.esFiltrado && !r.ciudad);

  // Para Piura: conversaciones de Piura + sin ciudad asignada
  const paraYazmin = [...piura, ...sinCiudad.slice(0, Math.ceil(sinCiudad.length / 2))];
  // Para Lima: conversaciones de Lima + virtual + resto sin ciudad
  const paraAyvi   = [...lima, ...virtual, ...sinCiudad.slice(Math.ceil(sinCiudad.length / 2))];

  const numPiura = process.env.ASISTENTE_PIURA;
  const numLima  = process.env.ASISTENTE_LIMA;

  try {
    if (numPiura && paraYazmin.length > 0) {
      const msg = construirMensaje("Piura", paraYazmin, filtrados);
      await enviarMensaje(numPiura, msg);
      console.log(`[INSIGHTS] Resumen enviado a Yazmin (${numPiura})`);
    }
    if (numLima && paraAyvi.length > 0) {
      const msg = construirMensaje("Lima", paraAyvi, filtrados);
      await enviarMensaje(numLima, msg);
      console.log(`[INSIGHTS] Resumen enviado a Ayvi (${numLima})`);
    }
  } catch (err) {
    console.error("[INSIGHTS] Error al enviar resumen:", err.message);
  }

  registrosDia = [];
}

// ── Scheduler — 8pm Lima (UTC-5) cada día ───────────────────────────────────

function msHastaSiguiente8pm() {
  const ahora    = new Date(Date.now() - 5 * 60 * 60 * 1000); // hora Lima
  const objetivo = new Date(ahora);
  objetivo.setUTCHours(20, 0, 0, 0); // 8pm Lima = 20:00 UTC-adjusted
  if (ahora >= objetivo) {
    objetivo.setUTCDate(objetivo.getUTCDate() + 1); // ya pasó, programar mañana
  }
  return objetivo.getTime() - ahora.getTime();
}

function programarResumenDiario() {
  const ms = msHastaSiguiente8pm();
  const mins = Math.round(ms / 1000 / 60);
  console.log(`[INSIGHTS] Próximo resumen diario en ${mins} minutos (8pm Lima)`);

  setTimeout(async () => {
    await generarYEnviarResumen();
    programarResumenDiario(); // reprogramar para mañana
  }, ms);
}

// Arranca el scheduler al importar el módulo
programarResumenDiario();

module.exports = { registrarConversacion };
