require("dotenv").config();
const { procesarConIA } = require("../src/services/openai");
const { detectarCrisis } = require("../src/agents/detectarCrisis");
const { analizarContexto } = require("../src/agents/analizarContexto");
const { filtrarTopico } = require("../src/agents/filtrarTopico");

// Escenario: pareja que quiere ir juntos a terapia.
// Objetivos de la prueba:
//   1. Verificar precio S/60 (terapia de pareja, no S/50)
//   2. Verificar que aparezcan emojis de la paleta nueva donde encajen
//      (🥹 🥺 ☺️ 🫂 🤓 🗓️) sin apilarlos ni decorar mensajes transaccionales.
const CONVERSACION = [
  "hola",
  "mi pareja y yo estamos pensando en ir juntos a terapia",
  "sentimos que ya no nos comunicamos, llevamos 8 años y estamos distanciados, me parte ver como se rompe todo",
  "estamos en Lima los dos, yo tengo 32 y mi pareja 34",
  "qué nos puedes contar del proceso",
  "perfecto, sí queremos agendar",
];

async function simularMensaje(historial, mensaje) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Tú: ${mensaje}`);

  const filtro = await filtrarTopico(mensaje);
  if (!filtro.pasar) {
    console.log(`\n🚫 FILTRADO — tipo: ${filtro.tipo}`);
    console.log(`   Respuesta: ${filtro.respuesta}`);
    return { historial, bloqueado: true };
  }

  const [crisis, contexto] = await Promise.all([
    detectarCrisis(mensaje),
    analizarContexto(historial),
  ]);

  if (crisis.esCrisis) {
    console.log(`\n🚨 CRISIS — nivel: ${crisis.nivel} | señales: ${crisis.senales.join(", ")}`);
  }

  const datosOk    = contexto.datos_disponibles.join(", ") || "ninguno";
  const datosFalta = contexto.datos_faltantes.join(", ")   || "ninguno";
  console.log(`🧭 etapa: ${contexto.etapa} | recogido: ${datosOk} | falta: ${datosFalta}`);
  if (contexto.precio_preguntado_antes) console.log(`   💰 Segunda vez pidiendo precio`);
  if (contexto.nota) console.log(`   Nota: ${contexto.nota}`);

  let mensajeParaIA;
  if (crisis.esCrisis) {
    mensajeParaIA = `⚠️ ALERTA CRISIS (nivel: ${crisis.nivel}). Señales: ${crisis.senales.join(", ")}. Activa PROTOCOLO DE CRISIS.\n\nMensaje: ${mensaje}`;
  } else if (contexto.etapa !== "apertura") {
    const precioBis = contexto.precio_preguntado_antes ? " SEGUNDA VEZ que pregunta el precio — dalo ya (S/50 individual, S/60 si es pareja)." : "";
    const nota = contexto.nota ? ` ${contexto.nota}` : "";
    mensajeParaIA = `[CONTEXTO: etapa=${contexto.etapa} | recogido: ${datosOk} | falta: ${datosFalta}.${precioBis}${nota}]\n\n${mensaje}`;
  } else {
    mensajeParaIA = mensaje;
  }

  const { respuesta, imagenes, stickers, lead, historialActualizado } =
    await procesarConIA(historial, mensajeParaIA);

  console.log(`\nEli: ${respuesta}`);
  if (imagenes?.length) console.log(`     📎 Imágenes: ${imagenes.join(", ")}`);
  if (stickers?.length) console.log(`     🎨 Sticker: ${stickers.join(", ")}`);

  const datosCapturados = Object.entries(lead || {})
    .filter(([, v]) => v && v !== "" && v !== null)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");
  if (datosCapturados) console.log(`     📋 Lead: ${datosCapturados}`);

  return { historial: historialActualizado, bloqueado: false };
}

async function main() {
  console.log("═".repeat(60));
  console.log("  Prueba — emojis nuevos + precio S/60 terapia de pareja");
  console.log("═".repeat(60));

  let historial = [];

  for (const mensaje of CONVERSACION) {
    const resultado = await simularMensaje(historial, mensaje);
    if (!resultado.bloqueado) historial = resultado.historial;
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("  Fin de simulación");
  console.log("═".repeat(60));
}

main().catch(console.error);
