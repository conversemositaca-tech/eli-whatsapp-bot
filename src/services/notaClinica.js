/**
 * Notas clínicas por voz (integración con Itaca).
 *
 * Cuando una PSICÓLOGA registrada escribe a Eli, en vez del flujo de leads entra
 * en "modo nota clínica": manda una nota de voz, Eli la transcribe, pregunta de
 * qué paciente es, confirma, pregunta el tipo y guarda la atención en la historia
 * clínica del sistema (Itaca) vía su mini-API con token compartido.
 *
 * El estado de la conversación vive EN MEMORIA y es transitorio (no persistimos la
 * transcripción en ningún lado salvo el sistema clínico al guardar · Ley 29733).
 */
const axios = require("axios");
const { enviarMensaje, descargarMediaBase64 } = require("./evolution");
const { transcribirAudio } = require("./openai");

const ITACA_URL = (process.env.ITACA_API_URL || "").replace(/\/+$/, "");
const ITACA_TOKEN = process.env.ITACA_INTEGRACION_TOKEN || "";

const itaca = axios.create({
  baseURL: ITACA_URL,
  headers: { "X-Integracion-Token": ITACA_TOKEN, "Content-Type": "application/json" },
  timeout: 25000,
});

// ── Cache de "¿este número es psicóloga?" (telefono → {value, expiry}) ──────────
const cachePsico = new Map();
const PSICO_TTL = 10 * 60 * 1000;

/** Devuelve el objeto psicóloga {id, nombre, clinica} o null. Cachea 10 min. */
async function esPsicologo(telefono) {
  if (!ITACA_URL || !ITACA_TOKEN) return null; // integración apagada → flujo normal
  const hit = cachePsico.get(telefono);
  if (hit && Date.now() < hit.expiry) return hit.value;
  let value = null;
  try {
    const { data } = await itaca.get("/api/integraciones/psicologo/", { params: { telefono } });
    value = data && data.ok ? data : null;
  } catch (e) {
    console.warn(`[NOTA] esPsicologo error ${telefono}: ${e.message}`);
    value = null; // ante error, NO lo tratamos como psicóloga (cae al flujo de leads)
  }
  cachePsico.set(telefono, { value, expiry: Date.now() + PSICO_TTL });
  return value;
}

/** Versión síncrona desde cache (para decidir el debounce sin esperar red). */
function psicologoEnCache(telefono) {
  const hit = cachePsico.get(telefono);
  return !!(hit && Date.now() < hit.expiry && hit.value);
}

// ── Estado de la conversación (en memoria, con expiración) ──────────────────────
const sesiones = new Map(); // telefono → { step, ts, transcripcion, candidatos, paciente, tipo }
const SESION_TTL = 20 * 60 * 1000;

function getSesion(telefono) {
  const s = sesiones.get(telefono);
  if (s && Date.now() - s.ts > SESION_TTL) { sesiones.delete(telefono); return null; }
  return s || null;
}
function setSesion(telefono, s) { sesiones.set(telefono, { ...s, ts: Date.now() }); }
function limpiar(telefono) { sesiones.delete(telefono); }

const esCancelar = (t) => /^(cancelar|cancela|cancel|olv[ií]dalo)$/i.test((t || "").trim());
const esSi = (t) => /^(s[ií]|si|yes|ok|oka?y|dale|correcto|confirmo|as[ií] es|exacto)$/i.test((t || "").trim());
const esNo = (t) => /^(no|nop|negativo|incorrecto)$/i.test((t || "").trim());

function pacienteLabel(p) {
  const doc = p.documento ? ` · DNI ${p.documento}` : "";
  const sede = p.sede ? ` · ${p.sede}` : "";
  return `*${p.nombre}*${doc}${sede}`;
}

async function transcribirAudios(mensajes) {
  const partes = [];
  for (const msg of mensajes) {
    if (msg.tipo !== "audio") continue;
    try {
      const { base64, mimetype } = await descargarMediaBase64(msg.data);
      const t = await transcribirAudio(base64, mimetype);
      if (t && t.trim().length > 2) partes.push(t.trim());
    } catch (e) {
      console.warn(`[NOTA] transcribir error: ${e.message}`);
    }
  }
  return partes.join(" ").trim();
}

async function buscarPaciente(telefono, q) {
  const { data } = await itaca.get("/api/integraciones/pacientes/", { params: { telefono, q } });
  return (data && data.pacientes) || [];
}

async function guardarNota(telefono, sesion) {
  const { data } = await itaca.post("/api/integraciones/nota-voz/", {
    telefono, paciente_id: sesion.paciente.id, tipo: sesion.tipo,
    resumen: sesion.resumen || "", aspectos: sesion.aspectos || "",
    objetivos: sesion.objetivos || "", recomendaciones: sesion.recomendaciones || "",
  });
  return data;
}

const esOmitir = (t) => /^(omitir|omite|saltar|nada|ninguna|ninguno|-)$/i.test((t || "").trim());
const tipoLabel = (t) => (t === "historia" ? "Historia clínica" : "Ficha de evolución");
const corto = (s, n = 220) => { s = (s || "").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };

function preguntarTipo(telefono, sesion, prefijo = "") {
  const p = prefijo ? prefijo + " " : "";
  return enviarMensaje(telefono,
    `${p}¿Qué tipo de nota es para ${pacienteLabel(sesion.paciente)}?\n\n` +
    `*1)* Historia clínica (primera vez)\n*2)* Ficha de evolución (seguimiento)\n\nResponde *1* o *2*.`);
}

/** Vuelve a preguntar el paso actual (tras agregar audio a una nota en curso). */
function repreguntar(telefono, sesion, prefijo) {
  switch (sesion.step) {
    case "ASK_PATIENT":    return enviarMensaje(telefono, `${prefijo} ¿De qué *paciente* es? (nombre o DNI)`);
    case "CONFIRM_PATIENT":return enviarMensaje(telefono, `${prefijo} ¿Es ${pacienteLabel(sesion.candidatos[0])}? (*sí*/*no*)`);
    case "PICK_PATIENT":   return enviarMensaje(telefono, `${prefijo} Responde con el *número* del paciente de la lista.`);
    case "ASK_TIPO":       return preguntarTipo(telefono, sesion, prefijo);
    case "CONFIRM_SAVE":   return enviarMensaje(telefono, `${prefijo} ¿Confirmas guardar? (*sí*/*cancelar*)`);
    default:               return enviarMensaje(telefono, prefijo);
  }
}

/**
 * Punto de entrada del modo nota clínica. Llamado desde el webhook cuando el
 * número es de una psicóloga. `mensajes` es el lote acumulado (audios y/o texto).
 */
async function manejarNotaClinica(telefono, mensajes, psico) {
  const texto = mensajes
    .filter((m) => m.tipo !== "audio")
    .map((m) => m.texto)
    .filter(Boolean)
    .join(" ")
    .trim();
  const hayAudio = mensajes.some((m) => m.tipo === "audio");
  const transAudio = hayAudio ? await transcribirAudios(mensajes) : "";
  // Respuesta del paso actual: lo dictado por voz (si hubo audio) o lo que escribió.
  const input = (transAudio || texto).trim();
  let sesion = getSesion(telefono);

  // Cancelar en cualquier momento
  if (sesion && esCancelar(texto)) {
    limpiar(telefono);
    return enviarMensaje(telefono, "Listo, cancelé esa nota. No guardé nada. 👍");
  }

  // ── Sin sesión: arranca con la nota de voz (el resumen de la sesión) ──
  if (!sesion) {
    if (hayAudio && !transAudio) {
      return enviarMensaje(telefono, "No pude escuchar el audio 😕. ¿Me lo reenvías?");
    }
    if (hayAudio) {
      sesion = { step: "ASK_PATIENT", resumen: transAudio };
      setSesion(telefono, sesion);
      return enviarMensaje(telefono,
        `📝 Recibí tu nota de voz, *${psico.nombre}*.\n\n¿De qué *paciente* es? (nombre o DNI)`);
    }
    return enviarMensaje(telefono,
      `Hola ${psico.nombre} 👋 Soy Eli. Para registrar una sesión, envíame la *nota de voz* ` +
      `(el resumen) y te guío con unas preguntas.`);
  }

  switch (sesion.step) {
    case "ASK_PATIENT": {
      if (input.length < 2) {
        return enviarMensaje(telefono, "Escríbeme (o dime) el *nombre* o *DNI* del paciente.");
      }
      let pacientes;
      try { pacientes = await buscarPaciente(telefono, input); }
      catch (e) {
        console.warn(`[NOTA] buscar error: ${e.message}`);
        return enviarMensaje(telefono, "Tuve un problema buscando al paciente 😕. Inténtalo de nuevo en un momento.");
      }
      if (pacientes.length === 0) {
        return enviarMensaje(telefono,
          `No encontré a *${input}* en el sistema. Revisa el nombre o DNI y escríbelo de nuevo (o *cancelar*).`);
      }
      if (pacientes.length === 1) {
        sesion.candidatos = pacientes; sesion.step = "CONFIRM_PATIENT"; setSesion(telefono, sesion);
        return enviarMensaje(telefono, `¿Es ${pacienteLabel(pacientes[0])}?\n\nResponde *sí* o *no*.`);
      }
      sesion.candidatos = pacientes; sesion.step = "PICK_PATIENT"; setSesion(telefono, sesion);
      const lista = pacientes.map((p, i) => `*${i + 1})* ${pacienteLabel(p)}`).join("\n");
      return enviarMensaje(telefono, `Encontré varios:\n\n${lista}\n\nResponde con el *número* (o *cancelar*).`);
    }

    case "CONFIRM_PATIENT": {
      if (esSi(texto)) {
        sesion.paciente = sesion.candidatos[0]; sesion.step = "ASK_TIPO"; setSesion(telefono, sesion);
        return preguntarTipo(telefono, sesion);
      }
      if (esNo(texto)) {
        sesion.step = "ASK_PATIENT"; sesion.candidatos = null; setSesion(telefono, sesion);
        return enviarMensaje(telefono, "Ok. Escríbeme el *nombre* o *DNI* del paciente correcto.");
      }
      return enviarMensaje(telefono, "Responde *sí* o *no*, por favor 🙏");
    }

    case "PICK_PATIENT": {
      const n = parseInt((texto.match(/\d+/) || [""])[0], 10);
      if (!n || n < 1 || n > sesion.candidatos.length) {
        return enviarMensaje(telefono, `Responde con el *número* de la lista (1 a ${sesion.candidatos.length}).`);
      }
      sesion.paciente = sesion.candidatos[n - 1]; sesion.step = "ASK_TIPO"; setSesion(telefono, sesion);
      return preguntarTipo(telefono, sesion);
    }

    case "ASK_TIPO": {
      const t = texto.toLowerCase();
      let tipo = null;
      if (t === "1" || t.includes("histor")) tipo = "historia";
      else if (t === "2" || t.includes("evol")) tipo = "evolucion";
      if (!tipo) return preguntarTipo(telefono, sesion, "No te entendí.");
      sesion.tipo = tipo; sesion.step = "Q_ASPECTOS"; setSesion(telefono, sesion);
      return enviarMensaje(telefono,
        `Perfecto, una *${tipoLabel(tipo)}* para ${pacienteLabel(sesion.paciente)}.\n\n` +
        `Te hago 3 preguntas para completarla (responde por *voz* o *texto*, o escribe *omitir*).\n\n` +
        `*2) Aspectos clínicamente relevantes:*`);
    }

    case "Q_ASPECTOS": {
      sesion.aspectos = esOmitir(input) ? "" : input;
      sesion.step = "Q_OBJETIVOS"; setSesion(telefono, sesion);
      return enviarMensaje(telefono, "*3) Objetivos o tareas:*");
    }

    case "Q_OBJETIVOS": {
      sesion.objetivos = esOmitir(input) ? "" : input;
      sesion.step = "Q_RECOMENDACIONES"; setSesion(telefono, sesion);
      return enviarMensaje(telefono, "*4) Recomendaciones:*");
    }

    case "Q_RECOMENDACIONES": {
      sesion.recomendaciones = esOmitir(input) ? "" : input;
      sesion.step = "CONFIRM_SAVE"; setSesion(telefono, sesion);
      return enviarMensaje(telefono,
        `Voy a guardar esta *${tipoLabel(sesion.tipo)}* en la historia de ${pacienteLabel(sesion.paciente)}:\n\n` +
        `📝 *Resumen:* ${corto(sesion.resumen) || "—"}\n` +
        `🔍 *Aspectos:* ${corto(sesion.aspectos) || "—"}\n` +
        `🎯 *Objetivos:* ${corto(sesion.objetivos) || "—"}\n` +
        `✅ *Recomendaciones:* ${corto(sesion.recomendaciones) || "—"}\n\n` +
        `¿Confirmas? Responde *sí* o *cancelar*.`);
    }

    case "CONFIRM_SAVE": {
      if (esSi(texto)) {
        try {
          const r = await guardarNota(telefono, sesion);
          limpiar(telefono);
          if (r && r.ok) {
            return enviarMensaje(telefono,
              `✅ Guardado en la historia de *${r.paciente}* (${r.tipo}). Puedes revisarlo y editarlo en el sistema. 🙌`);
          }
          return enviarMensaje(telefono, `No pude guardarlo 😕 (${(r && r.detail) || "error"}). Inténtalo de nuevo.`);
        } catch (e) {
          console.warn(`[NOTA] guardar error: ${e.message}`);
          limpiar(telefono);
          return enviarMensaje(telefono, "Tuve un problema al guardar la nota 😕. Inténtalo de nuevo en un momento.");
        }
      }
      if (esCancelar(texto) || esNo(texto)) {
        limpiar(telefono);
        return enviarMensaje(telefono, "Cancelado, no guardé nada. 👍");
      }
      return enviarMensaje(telefono, "Responde *sí* para guardar o *cancelar* para descartar.");
    }

    default:
      limpiar(telefono);
      return enviarMensaje(telefono, "Empecemos de nuevo: envíame la *nota de voz* de la sesión.");
  }
}

module.exports = { esPsicologo, psicologoEnCache, manejarNotaClinica };
