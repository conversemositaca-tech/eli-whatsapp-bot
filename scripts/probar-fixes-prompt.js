/**
 * Prueba los 4 fixes recién aplicados al SYSTEM_PROMPT.
 * Cada escenario corre aislado con historial mockeado y muestra la
 * respuesta de Eli para evaluar manualmente si el fix tomó.
 *
 * Uso: node scripts/probar-fixes-prompt.js
 */

require("dotenv").config();
const { procesarConIA } = require("../src/services/openai");
const { detectarCrisis } = require("../src/agents/detectarCrisis");
const { analizarContexto } = require("../src/agents/analizarContexto");

function linea(c = "─", n = 70) { return c.repeat(n); }

async function correrEscenario(nombre, historial, mensaje, esperado) {
  console.log("\n" + linea("═"));
  console.log(`  ${nombre}`);
  console.log(linea("═"));
  console.log(`Historial previo: ${historial.length} mensajes`);
  console.log(`Mensaje del usuario: "${mensaje}"`);

  const [crisis, contexto] = await Promise.all([
    detectarCrisis(mensaje),
    analizarContexto(historial),
  ]);

  console.log(`\n🧭 contexto → etapa: ${contexto.etapa} | recogido: ${contexto.datos_disponibles.join(", ") || "—"} | falta: ${contexto.datos_faltantes.join(", ") || "—"}`);
  if (crisis.esCrisis) console.log(`🚨 crisis detectada — nivel: ${crisis.nivel}`);

  let mensajeParaIA;
  if (crisis.esCrisis) {
    mensajeParaIA = `⚠️ ALERTA CRISIS (nivel: ${crisis.nivel}). Señales: ${crisis.senales.join(", ")}. Activa PROTOCOLO DE CRISIS.\n\nMensaje: ${mensaje}`;
  } else if (contexto.etapa !== "apertura") {
    const datosOk    = contexto.datos_disponibles.join(", ") || "ninguno";
    const datosFalta = contexto.datos_faltantes.join(", ")   || "ninguno";
    const nota       = contexto.nota ? ` ${contexto.nota}` : "";
    mensajeParaIA =
      `[CONTEXTO: etapa=${contexto.etapa} | recogido: ${datosOk} | falta: ${datosFalta}.${nota}]\n\n${mensaje}`;
  } else {
    mensajeParaIA = mensaje;
  }

  const { respuesta } = await procesarConIA(historial, mensajeParaIA);

  console.log(`\nEli respondió:\n  ${respuesta.replace(/\n/g, "\n  ")}\n`);
  console.log(`✅ Esperado: ${esperado.descripcion}`);
  if (esperado.deberia) console.log(`   Debe contener señal de: ${esperado.deberia.join(" | ")}`);
  if (esperado.noDeberia) console.log(`   NO debe contener: ${esperado.noDeberia.join(" | ")}`);
}

async function main() {
  // Helper para simular historial: pares (user, assistant_json_response)
  const turno = (user, eliRespuesta) => [
    { role: "user", content: user },
    { role: "assistant", content: JSON.stringify({ respuesta: eliRespuesta, lead: {}, imagenes: [], stickers: [] }) },
  ];

  // ── ESCENARIO 1 — Pregunta si se comunican por este chat ──────────────
  // Lead ya dio DNI y Eli derivó. Ahora pregunta "¿se comunican por aquí?".
  const hist1 = [
    ...turno("Hola, quiero información", "Hola! Soy Eli 🐘 el asistente virtual de Itaca conversemos 🩵. ¿La atención sería para ti o para alguien más?"),
    ...turno("para mí", "¿Me puedes comentar tu edad y si te gustaría la atención presencial en Piura, Lima o virtual?"),
    ...turno("30, Lima", "Nuestra sede Lima está en Av. Arequipa 4130, of. 205, Miraflores. ¿Qué tal te queda?"),
    ...turno("bien", "Para orientarte hacia el psicólogo ideal, ¿cuál sería el motivo de consulta?"),
    ...turno("ansiedad y estrés", "Gracias por contarme. Esta información me ayuda a orientarte 🩵 ¿Te gustaría que te cuente sobre la primera consulta?"),
    ...turno("sí", "El primer paso para iniciar terapia es agendar una consulta 👆 Esta cita dura 30-50 min y tiene una inversión de S/50. ¿Te gustaría que agendemos?"),
    ...turno("sí, mi DNI es 76603177", "Perfecto. Voy a pedirle a Ayvi, nuestra coordinadora de la sede Lima, que te escriba para coordinar el horario."),
  ];
  await correrEscenario(
    "ESCENARIO 1 — pregunta si la coordi escribe por este chat",
    hist1,
    "¿Se comunicarán conmigo por este chat?",
    {
      descripcion: "Aclarar que Ayvi escribe desde otro celular, NO desde este chat",
      deberia: ["otro celular", "su celular", "su WhatsApp", "número nuevo", "mensaje nuevo"],
      noDeberia: ["este mismo chat", "por este chat", "por aquí", "directamente aquí"],
    }
  );

  // ── ESCENARIO 2 — Motivo dado fuera de orden ──────────────────────────
  // Lead da motivo en el primer audio. Luego confirma datos. Eli no debe re-preguntar motivo.
  const hist2 = [
    ...turno("Hola, quiero información", "Hola! Soy Eli 🐘 el asistente virtual de Itaca conversemos 🩵. ¿La atención sería para ti o para alguien más?"),
    ...turno("[El usuario envió un mensaje de voz diciendo:] La terapia sería para mí. He estado teniendo problemas de pareja, peleamos casi semanalmente y siento que mi pareja podría estar en depresión. No sé si terapia individual o de pareja.", "Entiendo, suena complicado. ¿Me puedes comentar tu edad y si la atención sería presencial en Piura, Lima o virtual?"),
    ...turno("30 años, Lima", "Nuestra sede Lima está en Av. Arequipa 4130, of. 205, Miraflores. ¿Qué tal te queda?"),
  ];
  await correrEscenario(
    "ESCENARIO 2 — motivo ya dado fuera de orden, NO repreguntar",
    hist2,
    "Está muy bien, me queda cerca",
    {
      descripcion: "No volver a preguntar motivo (ya lo dio), saltar a transición o info",
      deberia: ["pareja", "consulta", "psicólogo", "agendar", "primera"],
      noDeberia: ["¿cuál sería el motivo", "¿cuál es el motivo", "¿qué te gustaría trabajar", "qué está pasando o qué"],
    }
  );

  // ── ESCENARIO 3 — Malestar moderado, NO ofrecer Línea 113 ─────────────
  await correrEscenario(
    "ESCENARIO 3 — malestar moderado (sin riesgo agudo), no debe ofrecer 113",
    [],
    "Hola, me siento muy estresado últimamente, no duermo bien y siento que ya no disfruto nada",
    {
      descripcion: "Validar y derivar al psicólogo, NO mencionar Línea 113",
      deberia: ["psicólogo", "consulta", "ayuda", "acompaño"],
      noDeberia: ["Línea 113", "linea 113", "113 opción", "número de emergencia"],
    }
  );

  // ── ESCENARIO 4 — Usuario pide consejo directo ────────────────────────
  const hist4 = [
    ...turno("Hola, vengo por terapia", "Hola! Soy Eli. ¿La atención sería para ti o para alguien más?"),
    ...turno("Para mí, tengo problemas con mi familia, no sé si cortar contacto o seguir intentando", "Eso pesa. ¿Cómo estás cargando todo eso tú?"),
  ];
  await correrEscenario(
    "ESCENARIO 4 — pide consejo directo, Eli NO debe darlo",
    hist4,
    "¿Tú qué me recomiendas que haga? ¿Corto contacto?",
    {
      descripcion: "NO dar consejo, derivar al psicólogo",
      deberia: ["psicólogo", "consulta", "trabajar", "explorar"],
      noDeberia: ["te recomiendo", "podrías", "deberías", "lo que te conviene es", "intenta", "una buena forma"],
    }
  );

  console.log("\n" + linea("═"));
  console.log("  Fin de las pruebas — evalúa manualmente cada respuesta");
  console.log(linea("═"));
}

main().catch((e) => { console.error("[FATAL]", e.message); process.exit(1); });
