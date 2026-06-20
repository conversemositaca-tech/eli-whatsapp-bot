require("dotenv").config();
const { procesarConIA } = require("./src/services/openai");
const { detectarCrisis } = require("./src/agents/detectarCrisis");
const { analizarContexto } = require("./src/agents/analizarContexto");
const { filtrarTopico } = require("./src/agents/filtrarTopico");

const CONVERSACION = [
  "hola",
  "me siento muy ansioso últimamente, no puedo dormir bien",
  "lleevo como 3 meses así, desde que perdí mi trabajo",
  "cuánto cuesta la terapia?",
  "soy Andrea, tengo 27 años y estoy en Lima",
  "cuánto cuesta? me lo puedes decir ahora",
  "ok quiero agendar, mi DNI es 71234567",
];

async function simularMensaje(historial, mensaje) {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Tú: ${mensaje}`);

  // Filtro
  const filtro = await filtrarTopico(mensaje);
  if (!filtro.pasar) {
    console.log(`\n🚫 FILTRADO — tipo: ${filtro.tipo}`);
    console.log(`   Respuesta: ${filtro.respuesta}`);
    return { historial, bloqueado: true };
  }

  // Crisis + contexto en paralelo
  const [crisis, contexto] = await Promise.all([
    detectarCrisis(mensaje),
    analizarContexto(historial),
  ]);

  if (crisis.esCrisis) {
    console.log(`\n🚨 CRISIS — nivel: ${crisis.nivel} | señales: ${crisis.senales.join(", ")}`);
  }

  const datosOk    = contexto.datos_disponibles.join(", ") || "ninguno";
  const datosFalta = contexto.datos_faltantes.join(", ")   || "ninguno";
  console.log(`\n🧭 etapa: ${contexto.etapa} | recogido: ${datosOk} | falta: ${datosFalta}`);
  if (contexto.precio_preguntado_antes) console.log(`   💰 Segunda vez pidiendo precio`);
  if (contexto.nota) console.log(`   Nota: ${contexto.nota}`);

  // Construir mensaje para IA
  let mensajeParaIA;
  if (crisis.esCrisis) {
    mensajeParaIA = `⚠️ ALERTA CRISIS (nivel: ${crisis.nivel}). Señales: ${crisis.senales.join(", ")}. Activa PROTOCOLO DE CRISIS.\n\nMensaje: ${mensaje}`;
  } else if (contexto.etapa !== "apertura") {
    const precioBis = contexto.precio_preguntado_antes ? " SEGUNDA VEZ que pregunta el precio — dalo ya (S/50)." : "";
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
  console.log("═".repeat(50));
  console.log("  Simulación automática — Eli Multi-Agente");
  console.log("═".repeat(50));

  let historial = [];

  for (const mensaje of CONVERSACION) {
    const resultado = await simularMensaje(historial, mensaje);
    if (!resultado.bloqueado) historial = resultado.historial;
    await new Promise(r => setTimeout(r, 500)); // pausa entre mensajes
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log("  Fin de simulación");
  console.log("═".repeat(50));
}

main().catch(console.error);
