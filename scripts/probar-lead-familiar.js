/**
 * Simula una conversación completa donde el lead pide terapia para su madre.
 * Valida varias reglas del SYSTEM_PROMPT que aplican al flujo "para otra persona":
 *
 *   1. Eli adapta la pregunta de edad+sede al pariente, no al lead.
 *   2. Eli pregunta el motivo refiriéndose al pariente.
 *   3. Tras el motivo, Eli abre ESPACIO EMOCIONAL para QUIEN ESCRIBE
 *      ("¿cómo estás tú con todo esto?"), no solo para el paciente.
 *   4. Eli NO asume que el lead también es paciente — si abre el espacio
 *      y el lead lo confirma, lo deriva también; si no, sigue con el paciente.
 *   5. Al pedir datos, distingue "DNI del paciente" (la mamá) de "DNI del
 *      contacto" (quien escribe).
 *
 * Uso: node scripts/probar-lead-familiar.js
 */

require("dotenv").config();
const { procesarConIA } = require("../src/services/openai");
const { detectarCrisis } = require("../src/agents/detectarCrisis");
const { analizarContexto } = require("../src/agents/analizarContexto");

function linea(c = "─", n = 70) { return c.repeat(n); }

const TURNOS = [
  "hola buenas",
  "para mi mamá",
  "tiene 65 años, en Lima",
  "bien me queda cerca",
  "ella ha estado muy deprimida desde que falleció mi papá hace 6 meses, ya no quiere salir, no come bien, llora todo el tiempo",
  "sí la verdad estoy agotada, soy yo la que ha estado a cargo de todo desde que pasó",
  "me llamo Andrea, mi DNI es 71234567 y el de mi mamá 09876543",
];

async function correrTurno(historial, mensaje, turnoNum) {
  console.log("\n" + linea("─"));
  console.log(`Turno ${turnoNum}`);
  console.log(linea("─"));
  console.log(`Lead: ${mensaje}`);

  const [crisis, contexto] = await Promise.all([
    detectarCrisis(mensaje),
    analizarContexto(historial),
  ]);

  console.log(`\n[contexto] etapa: ${contexto.etapa} | recogido: ${contexto.datos_disponibles.join(", ") || "—"} | falta: ${contexto.datos_faltantes.join(", ") || "—"}`);
  if (crisis.esCrisis) console.log(`[crisis] nivel: ${crisis.nivel}`);

  let mensajeParaIA;
  if (crisis.esCrisis) {
    mensajeParaIA = `⚠️ ALERTA CRISIS (nivel: ${crisis.nivel}). Señales: ${crisis.senales.join(", ")}. Activa PROTOCOLO DE CRISIS.\n\nMensaje: ${mensaje}`;
  } else if (contexto.etapa !== "apertura") {
    const datosOk    = contexto.datos_disponibles.join(", ") || "ninguno";
    const datosFalta = contexto.datos_faltantes.join(", ")   || "ninguno";
    const nota       = contexto.nota ? ` ${contexto.nota}` : "";
    mensajeParaIA = `[CONTEXTO: etapa=${contexto.etapa} | recogido: ${datosOk} | falta: ${datosFalta}.${nota}]\n\n${mensaje}`;
  } else {
    mensajeParaIA = mensaje;
  }

  const { respuesta, lead, historialActualizado } = await procesarConIA(historial, mensajeParaIA);

  console.log(`\nEli:\n  ${respuesta.replace(/\n/g, "\n  ")}`);

  const datosLead = Object.entries(lead || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
  if (datosLead.length) console.log(`\n[lead capturado] ${datosLead.join(" | ")}`);

  return historialActualizado;
}

async function main() {
  console.log("═".repeat(70));
  console.log("  Simulación: lead para familiar (madre)");
  console.log("═".repeat(70));

  let historial = [];
  let i = 1;
  for (const mensaje of TURNOS) {
    historial = await correrTurno(historial, mensaje, i++);
  }

  console.log("\n" + "═".repeat(70));
  console.log("  Fin — evalúa manualmente cada turno:");
  console.log("═".repeat(70));
  console.log("  Turno 2: ¿adaptó la pregunta a 'tu mamá'?");
  console.log("  Turno 3: ¿dio dirección Lima sin re-preguntar la sede?");
  console.log("  Turno 4: ¿preguntó motivo refiriéndose a la mamá?");
  console.log("  Turno 5: ¿validó + abrió espacio emocional para QUIEN ESCRIBE?");
  console.log("           (debería decir algo tipo '¿cómo estás tú con todo esto?')");
  console.log("  Turno 6: ¿reconoció el agotamiento del lead sin asumir terapia para ella?");
  console.log("  Turno 7: ¿separó DNI del contacto y DNI de la paciente correctamente?");
}

main().catch((e) => { console.error("[FATAL]", e.message); process.exit(1); });
