// Dry-run del sistema de followup.
// Se conecta al Airtable real, lee la tabla LEADS y muestra qué le tocaría
// mandar a cada lead en este momento — SIN enviar nada por WhatsApp.
//
// Uso:  node scripts/probar-followup.js

require("dotenv").config();
const { obtenerLeadsEnFollowup } = require("../src/services/supabase");

const HORA_MS = 60 * 60 * 1000;

const SECUENCIA = [
  { delayMs: 1 * HORA_MS,   etiqueta: "Paso 1 (+1h)   solo texto" },
  { delayMs: 2 * HORA_MS,   etiqueta: "Paso 2 (+2h)   solo texto" },
  { delayMs: 21 * HORA_MS,  etiqueta: "Paso 3 (+21h)  imagen 1" },
  { delayMs: 48 * HORA_MS,  etiqueta: "Paso 4 (+48h)  imagen 2" },
  { delayMs: 48 * HORA_MS,  etiqueta: "Paso 5 (+48h)  imagen 8" },
  { delayMs: 48 * HORA_MS,  etiqueta: "Paso 6 (+48h)  imagen 5" },
  { delayMs: 72 * HORA_MS,  etiqueta: "Paso 7 (+72h)  imagen 9" },
  { delayMs: 120 * HORA_MS, etiqueta: "Paso 8 (+120h) imagen 10" },
];

function formatearHoras(ms) {
  const horas = ms / HORA_MS;
  if (horas < 1) return `${Math.round(ms / 60000)}min`;
  if (horas < 24) return `${horas.toFixed(1)}h`;
  return `${(horas / 24).toFixed(1)}d`;
}

(async () => {
  console.log("\n=== DRY-RUN FOLLOWUP — no se envían mensajes reales ===\n");

  const leads = await obtenerLeadsEnFollowup();
  console.log(`Leads activos en seguimiento: ${leads.length}\n`);

  if (leads.length === 0) {
    console.log("(No hay leads con PASO_FOLLOWUP < 8 — nada que evaluar)");
    return;
  }

  const ahora = Date.now();
  let aDisparar = 0;
  let sinTimestamp = 0;
  let esperando = 0;

  for (const record of leads) {
    const f = record.fields;
    const tel = f["CELULAR"] || "(sin celular)";
    const nombre = f["NOMBRES"] || "(sin nombre)";
    const estado = f["ESTADO"] || "(sin estado)";
    const paso = f["PASO_FOLLOWUP"] ?? 0;
    const ult = f["ult_actividad_bot"];

    if (paso >= SECUENCIA.length) continue;

    if (!ult) {
      sinTimestamp++;
      console.log(`⏭️  ${tel} ${nombre} | paso ${paso} | SIN ult_actividad_bot — se salta`);
      continue;
    }

    const diff = ahora - new Date(ult).getTime();
    const step = SECUENCIA[paso];
    const transcurrido = formatearHoras(diff);
    const requerido = formatearHoras(step.delayMs);

    if (diff >= step.delayMs) {
      aDisparar++;
      console.log(`✅ ${tel} ${nombre} | ${estado} | ${step.etiqueta} | inactivo ${transcurrido} (req ${requerido}) → DISPARA`);
    } else {
      esperando++;
      const falta = formatearHoras(step.delayMs - diff);
      console.log(`⏳ ${tel} ${nombre} | ${estado} | ${step.etiqueta} | inactivo ${transcurrido} (req ${requerido}) → faltan ${falta}`);
    }
  }

  console.log("\n=== RESUMEN ===");
  console.log(`✅ Dispararían ahora: ${aDisparar}`);
  console.log(`⏳ Aún en espera:    ${esperando}`);
  console.log(`⏭️  Sin timestamp:    ${sinTimestamp}`);
  console.log("");
})().catch((err) => {
  console.error("\nError:", err.message);
  if (err.response) {
    console.error("URL llamada:", err.config?.url);
    console.error("Status:", err.response.status);
    console.error("Detalle Airtable:", JSON.stringify(err.response.data, null, 2));
    console.error("AIRTABLE_BASE_ID en .env:", process.env.AIRTABLE_BASE_ID);
  }
  process.exit(1);
});
