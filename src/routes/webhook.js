const express = require("express");
const router = express.Router();

const {
  iniciarPresencia,
  presenciaInmediata,
  simularEscribiendo,
  enviarMensaje,
  enviarMensajeChunked,
  enviarImagenUrl,
  enviarSticker,
  extraerTexto,
  extraerTelefono,
  extraerTipoMensaje,
  extraerStickerSha256,
  descargarMediaBase64,
} = require("../services/evolution");
const {
  estaEnAtencionHumana,
  pausarAtencion,
  reactivarAtencion,
  esStickerPausa,
  esStickerReactivar,
  registrarStickerCapturado,
} = require("../services/handoff");

const UBICACION_BASE = "https://raw.githubusercontent.com/mirainishimura-maker/eli-whatsapp-bot/main/assets/ubicacion";
const ASSETS_BASE = "https://raw.githubusercontent.com/mirainishimura-maker/eli-whatsapp-bot/main/assets";

// Imágenes predefinidas que Eli puede enviar al cliente
const IMAGENES = {
  yape_qr:        { url: process.env.IMG_YAPE_QR,    caption: "📲 QR de pago — Yape (Gabriela Rentería)" },
  bcp_cuenta:     { url: process.env.IMG_BCP_CUENTA, caption: "🏦 Datos de cuenta BCP — ITACA CONVERSEMOS" },
  mapa_piura:     { url: `${UBICACION_BASE}/mapa_piura.jpeg`,  caption: "📍 Sede Piura — Av. Bolognesi N° 582, 2do piso of. 201" },
  foto_piura_1:   { url: `${UBICACION_BASE}/foto_piura_1.jpeg`, caption: "🏢 Entrada del edificio — busca el 2do piso, of. 201" },
  foto_piura_2:   { url: `${UBICACION_BASE}/foto_piura_2.jpeg`, caption: "🏢 Fachada del edificio" },
  mapa_lima:      { url: `${UBICACION_BASE}/mapa_lima.jpeg`,   caption: "📍 Sede Lima — Av. Arequipa 4130, of. 205, Miraflores" },
  foto_lima:      { url: `${UBICACION_BASE}/foto_lima.jpeg`,   caption: "🏢 Edificio sede Lima — Av. Arequipa 4130, Miraflores" },
  que_es_consulta:{ url: `${ASSETS_BASE}/que_es_consulta.jpeg`, caption: "" },
  brujula:        { url: `${ASSETS_BASE}/brujula.jpeg`, caption: "" },
};

const STICKER_BASE = "https://raw.githubusercontent.com/mirainishimura-maker/eli-whatsapp-bot/main/assets/stickers";

// Stickers de marca que Eli puede enviar según el contexto emocional
const STICKERS = {
  estoy_aqui:            `${STICKER_BASE}/estoy_aqui.png`,
  estoy_para_ayudarte:   `${STICKER_BASE}/estoy_para_ayudarte.png`,
  te_leo_con_carino:     `${STICKER_BASE}/te_leo_con_carino.png`,
  un_dia_a_la_vez:       `${STICKER_BASE}/un_dia_a_la_vez.png`,
  lo_estas_haciendo_bien:`${STICKER_BASE}/lo_estas_haciendo_bien.png`,
  tu_espacio_te_espera:  `${STICKER_BASE}/tu_espacio_te_espera.png`,
  gracias_por_confiar:   `${STICKER_BASE}/gracias_por_confiar.png`,
  cita_agendada:         `${STICKER_BASE}/cita_agendada.png`,
  fue_lindo_conversar:   `${STICKER_BASE}/fue_lindo_conversar.png`,
  nos_vemos_pronto:      `${STICKER_BASE}/nos_vemos_pronto.png`,
  fue_lindo_acompanarte: `${STICKER_BASE}/fue_lindo_acompanarte.png`,
  gracias:               `${STICKER_BASE}/gracias.png`,
  gracias_por_tu_mensaje:`${STICKER_BASE}/gracias_por_tu_mensaje.png`,
};

const { procesarConIA, transcribirAudio } = require("../services/openai");
const { esPsicologo, psicologoEnCache, manejarNotaClinica } = require("../services/notaClinica");
const { derivarLeadAAsistente } = require("../services/routing");
const { registrarLeadEnSheets, registrarLeadEnPipeline } = require("../services/googlesheets");
const { detectarCrisis } = require("../agents/detectarCrisis");
const { analizarContexto } = require("../agents/analizarContexto");
const { filtrarTopico } = require("../agents/filtrarTopico");
const { resumirSiNecesario } = require("../agents/resumirConversacion");
const { registrarConversacion } = require("../agents/insightsAgent");
const {
  buscarMemoria,
  crearMemoria,
  actualizarMemoria,
  registrarOActualizarLead,
  crearLeadInicialSiNoExiste,
  pausarFollowup,
} = require("../services/supabase");
const { calcularDemora, esperar } = require("../utils/humanDelay");

// ── DEBOUNCE ────────────────────────────────────────────────────────────────
// Espera 15s desde el ÚLTIMO mensaje del usuario antes de procesar.
// Si llegan varios mensajes seguidos (burbujas), los acumula y los procesa juntos
// como si fueran uno solo. Así Eli siempre da UNA sola respuesta.
const DEBOUNCE_MS = 15_000; // 15 segundos — agrupa burbujas y da sensación más humana
// En "modo nota clínica" (psicóloga ya reconocida) el ida y vuelta debe ser ágil:
// agrupamos solo 3s para no hacer esperar 15s en cada paso de la conversación.
const DEBOUNCE_NOTA_MS = 3_000;
const pendingMessages = new Map(); // telefono → { timer, mensajes[] }

// ── DEDUPLICACIÓN ────────────────────────────────────────────────────────────
// Evolution API puede mandar el mismo evento varias veces (reintentos, delivery
// receipts con el mismo ID). Guardamos los IDs procesados 5 min para evitar dobles.
const processedIds = new Map(); // messageId → expiry timestamp
const ID_TTL_MS = 5 * 60 * 1000;

function yaFueProcesado(id) {
  const expiry = processedIds.get(id);
  if (!expiry) return false;
  if (Date.now() > expiry) { processedIds.delete(id); return false; }
  return true;
}
function marcarProcesado(id) {
  processedIds.set(id, Date.now() + ID_TTL_MS);
}

/**
 * Descarta el buffer de mensajes pendientes de un número (y su timer), para
 * que una respuesta ya encolada no se dispare después de pausar a Eli.
 */
function cancelarPendientes(telefono) {
  const pending = pendingMessages.get(telefono);
  if (pending?.timer) clearTimeout(pending.timer);
  pendingMessages.delete(telefono);
}

/**
 * Procesa un sticker enviado por el propio número (fromMe). Si coincide con el
 * sticker de PAUSA, el operador toma el control y Eli deja de responder a ese
 * chat; si coincide con el de REACTIVAR, Eli retoma. Cualquier otro sticker
 * propio (incluidos los que envía la misma Eli) se ignora — solo se registra
 * su hash para poder calibrar los stickers de control la primera vez.
 */
function manejarStickerControl(data) {
  try {
    const remoteJid = data.key?.remoteJid || "";
    if (remoteJid.endsWith("@g.us")) return; // ignorar grupos

    // Evitar procesar el mismo evento dos veces (Evolution reintenta).
    const messageId = data.key?.id;
    if (messageId) {
      if (yaFueProcesado(messageId)) return;
      marcarProcesado(messageId);
    }

    const telefono = extraerTelefono(remoteJid);
    const sha = extraerStickerSha256(data.message);
    if (!telefono || !sha) return;

    registrarStickerCapturado(telefono, sha);
    console.log(`[CTRL] Sticker propio en ${telefono} — fileSha256=${sha}`);

    if (esStickerPausa(sha)) {
      console.log(`[CTRL] ⏸️  PAUSA — Eli deja de responder a ${telefono}`);
      cancelarPendientes(telefono);
      pausarAtencion(telefono).catch((e) => console.warn(`[CTRL] Error al pausar: ${e.message}`));
    } else if (esStickerReactivar(sha)) {
      console.log(`[CTRL] ▶️  REACTIVAR — Eli retoma ${telefono}`);
      reactivarAtencion(telefono).catch((e) => console.warn(`[CTRL] Error al reactivar: ${e.message}`));
    }
  } catch (e) {
    console.warn(`[CTRL] Error procesando sticker de control: ${e.message}`);
  }
}

/**
 * Procesa en background todos los mensajes acumulados de un usuario.
 * Combina textos, transcribe audios y responde con una sola llamada a la IA.
 */
async function procesarMensajesAcumulados(telefono, mensajes) {
  try {
    // ── Modo nota clínica ────────────────────────────────────────────────────
    // Si el número es de una psicóloga registrada en Itaca, Eli NO entra al flujo
    // de leads: la atiende para registrar la nota de voz en la historia clínica.
    const psico = await esPsicologo(telefono);
    if (psico) {
      await manejarNotaClinica(telefono, mensajes, psico);
      return;
    }

    const textosFinales = [];
    let imagenBase64 = null;
    let imagenMime = null;

    // Procesar cada mensaje acumulado en orden
    for (const msg of mensajes) {
      if (msg.tipo === "sticker") {
        textosFinales.push("[El usuario envió un sticker]");
        continue;
      }

      if (msg.tipo === "audio") {
        try {
          const { base64, mimetype } = await descargarMediaBase64(msg.data);
          const transcripcion = await transcribirAudio(base64, mimetype);
          if (transcripcion && transcripcion.trim().length > 2) {
            textosFinales.push(`[El usuario envió un mensaje de voz diciendo:] ${transcripcion}`);
          } else {
            textosFinales.push("[El usuario envió un audio pero no se escuchó nada — posiblemente el micrófono estaba apagado o el audio llegó en silencio. Pídele amablemente que lo reenvíe o que escriba lo que quería decir.]");
          }
          console.log(`[WHISPER] ${telefono} → "${transcripcion}"`);
        } catch (e) {
          console.warn(`[AUDIO] Error al transcribir:`, e.message);
          textosFinales.push("[El usuario envió un mensaje de voz que no se pudo transcribir.]");
        }
        continue;
      }

      if (msg.tipo === "imagen") {
        try {
          const { base64, mimetype } = await descargarMediaBase64(msg.data);
          imagenBase64 = base64;
          imagenMime = mimetype;
          textosFinales.push(msg.texto || "[El usuario compartió una imagen]");
          console.log(`[VISION] ${telefono} → imagen recibida (${mimetype})`);
        } catch (e) {
          console.warn(`[IMAGE] Error al descargar imagen:`, e.message);
          textosFinales.push(msg.texto || "[El usuario compartió una imagen que no se pudo procesar.]");
        }
        continue;
      }

      // Texto normal
      if (msg.texto) textosFinales.push(msg.texto);
    }

    const textoFinal = textosFinales.join("\n");
    if (!textoFinal) return;

    // ── 0+1. Filtro + memoria en paralelo ────────────────────────────────────
    // El filtro solo aplica a contactos nuevos — si ya hay historial es un
    // usuario activo y nunca lo bloqueamos (evita falsos positivos con nombres,
    // respuestas cortas, etc.)
    const filtroPromise  = filtrarTopico(textoFinal);
    const memoriaPromise = buscarMemoria(telefono);
    const crisisPromise  = detectarCrisis(textoFinal);

    const memoriaExistente = await memoriaPromise;
    const esPrimerContacto = !memoriaExistente;
    const historyPrevio    = memoriaExistente ? memoriaExistente.history : [];

    // Aplicar filtro SOLO si es primer contacto (sin historial previo)
    if (esPrimerContacto) {
      const filtro = await filtroPromise;
      if (!filtro.pasar) {
        console.log(`[FILTRO] ${telefono} bloqueado — tipo:${filtro.tipo}`);
        registrarConversacion({ telefono, esFiltrado: true, tipoFiltro: filtro.tipo, ciudad: null, motivo: null, tieneDNI: false, esCrisis: false, etapa: null });
        if (filtro.respuesta) await enviarMensajeChunked(telefono, filtro.respuesta);
        return;
      }
    }

    // Crear lead mínimo en Airtable apenas pasa el filtro — entra al sistema
    // de followup desde el primer mensaje, aunque todavía no haya dado motivo.
    // Si ya existe el lead, solo refresca ultima_actividad para reiniciar el contador.
    crearLeadInicialSiNoExiste(telefono).catch((err) =>
      console.warn(`[LEAD INICIAL] Error: ${err.message}`)
    );

    // analizarContexto necesita el historial → arranca en cuanto lo tenemos,
    // en paralelo con lo que quede de crisisPromise
    const contextoPromise = analizarContexto(historyPrevio);

    const [crisis, contexto] = await Promise.all([crisisPromise, contextoPromise]);

    if (crisis.esCrisis) {
      console.warn(`[CRISIS] ${telefono} — nivel:${crisis.nivel} señales:${crisis.senales.join(", ")}`);
    }
    console.log(`[CONTEXTO] ${telefono} — etapa:${contexto.etapa} | falta:${contexto.datos_faltantes.join(", ") || "nada"}`);

    // Construir mensaje para GPT-4o
    // — Crisis tiene prioridad absoluta (omite el contexto de etapa)
    // — Si no hay crisis, inyectamos la etapa y datos como pista para GPT-4o
    let mensajeParaIA;
    if (crisis.esCrisis) {
      mensajeParaIA = `⚠️ ALERTA CRISIS (nivel: ${crisis.nivel}). Señales detectadas: ${crisis.senales.join(", ")}. Activa el PROTOCOLO DE CRISIS inmediatamente.\n\nMensaje del usuario: ${textoFinal}`;
    } else if (contexto.etapa !== "apertura") {
      const datosOk    = contexto.datos_disponibles.join(", ") || "ninguno";
      const datosFalta = contexto.datos_faltantes.join(", ")   || "ninguno";
      const nota       = contexto.nota ? ` ${contexto.nota}` : "";
      const precioBis  = contexto.precio_preguntado_antes
        ? " SEGUNDA VEZ que pregunta el precio — dalo ya (S/50, primera consulta)."
        : "";
      const sinMotivo = contexto.datos_faltantes.includes("motivo")
        ? " ⚠️ NO menciones precio ni info de la primera consulta todavía — el motivo aún no fue dado."
        : "";
      mensajeParaIA =
        `[CONTEXTO: etapa=${contexto.etapa} | recogido: ${datosOk} | falta: ${datosFalta}.${precioBis}${sinMotivo}${nota}]\n\n${textoFinal}`;
    } else {
      mensajeParaIA = textoFinal;
    }

    // ── 2. Arrancar "escribiendo..." antes de llamar a la IA ──────────────
    // El loop se renueva cada 5s automáticamente hasta que llamemos detener()
    const presencia = iniciarPresencia(telefono);

    // ── 3. Procesar con IA ─────────────────────────────────────────────────
    const { respuesta, lead, imagenes, stickers, lead_cerrado, resumen_coordinadora, historialActualizado } = await procesarConIA(
      historyPrevio,
      mensajeParaIA,
      { imagenBase64, imagenMime }
    );

    console.log(`[IA] ${telefono} → calificacion:${lead?.calificacion} ciudad:${lead?.ciudad}${lead_cerrado ? " ✅ CERRADO" : ""}`);

    // ── 4. Esperar demora humana (typing sigue visible durante este tiempo) ─
    const demoraMs = calcularDemora(respuesta);
    console.log(`[DELAY] ${telefono} → ${(demoraMs / 1000).toFixed(1)}s`);
    await esperar(demoraMs);

    // ── 5. Detener typing y enviar respuesta ───────────────────────────────
    presencia.detener();

    // Primer contacto: enviar imagen de bienvenida antes del saludo
    if (esPrimerContacto && process.env.IMG_BIENVENIDA) {
      await enviarImagenUrl(telefono, process.env.IMG_BIENVENIDA, "");
      await esperar(800);
    }

    // Imágenes primero — llegan antes que el texto de respuesta
    const imagenesEnviar = Array.isArray(imagenes) ? imagenes : [];
    for (const imgId of imagenesEnviar) {
      const img = IMAGENES[imgId];
      if (img?.url) {
        console.log(`[IMG] Enviando imagen "${imgId}" a ${telefono}`);
        await enviarImagenUrl(telefono, img.url, img.caption);
      } else {
        console.warn(`[IMG] URL no configurada para imagen: "${imgId}"`);
      }
    }

    // Texto después (incluye "Ahí están..." y "¿Qué tal te parece la ubicación?")
    await enviarMensajeChunked(telefono, respuesta);

    // ── 5. Persistencia y routing (en paralelo) ────────────────────────────
    const historialParaGuardar = await resumirSiNecesario(historialActualizado);

    // Extraer resumen de conversación para incluir en Sheets y notificación
    let resumenConversacion = "";
    const primerMsg = historialParaGuardar[0];
    if (primerMsg?.role === "system" && primerMsg.content.includes("[RESUMEN")) {
      const match = primerMsg.content.match(/\[RESUMEN DE CONVERSACIÓN ANTERIOR: (.+?)\]/s);
      if (match) resumenConversacion = match[1];
    }
    if (!resumenConversacion && lead?.motivo) {
      const partes = [];
      if (lead.calificacion) partes.push(`[${lead.calificacion}]`);
      if (lead.para_quien && lead.para_quien !== "yo mismo") partes.push(`Para ${lead.para_quien}`);
      partes.push(lead.motivo);
      resumenConversacion = partes.join(" — ");
    }

    const promesas = [];

    if (memoriaExistente) {
      promesas.push(actualizarMemoria(memoriaExistente.recordId, historialParaGuardar));
    } else {
      promesas.push(crearMemoria(telefono, historialParaGuardar));
    }

    // Airtable — una sola llamada, siempre que haya motivo
    if (lead?.motivo) {
      console.log(`[CRM] Lead: ${lead.nombre_contacto || telefono} — ${lead.ciudad || "?"}`);
      promesas.push(
        registrarOActualizarLead(telefono, lead).then(({ isNew, dniNuevo }) => {
          if (lead.ciudad) {
            registrarLeadEnPipeline(telefono, lead);
          }
          if (isNew) {
            derivarLeadAAsistente(telefono, lead, "NUEVO_LEAD", resumenConversacion);
          }
          if (lead.dni_contacto) {
            registrarLeadEnSheets(telefono, lead, resumenConversacion);
            if (dniNuevo) derivarLeadAAsistente(telefono, lead, "LISTO_PARA_COORDINAR", resumenConversacion);
          }
        })
      );
    }

    // Lead cerrado → enviar resumen a coordinadora + pausar followup
    if (lead_cerrado && resumen_coordinadora) {
      const ciudad = (lead?.ciudad || "").toLowerCase();
      const numCoord = ciudad === "lima" ? process.env.ASISTENTE_LIMA : process.env.ASISTENTE_PIURA;
      const nombreCoord = ciudad === "lima" ? "Ayvi" : "Yazmin";
      if (numCoord) {
        console.log(`[CIERRE] Enviando resumen a ${nombreCoord} (${numCoord})`);
        promesas.push(
          enviarMensaje(numCoord, `✅ *LEAD CERRADO — ÍTACA ${ciudad === "lima" ? "LIMA" : "PIURA"}*\n\n${resumen_coordinadora}`)
            .catch((err) => console.warn(`[CIERRE] Error enviando resumen: ${err.message}`))
        );
      }
      promesas.push(pausarFollowup(telefono).catch(() => {}));
    }

    // Rechazo explícito → sacar al lead del recontacto automático
    if (lead?.rechazo_followup === true) {
      console.log(`[FOLLOWUP] ${telefono} marcado como rechazo — se detiene recontacto`);
      promesas.push(
        pausarFollowup(telefono).catch((err) =>
          console.warn(`[FOLLOWUP] Error pausando ${telefono}: ${err.message}`)
        )
      );
    }

    const stickersEnviar = Array.isArray(stickers) ? stickers : [];
    for (const stickerId of stickersEnviar) {
      const url = STICKERS[stickerId];
      if (url) {
        console.log(`[STICKER] Enviando sticker "${stickerId}" a ${telefono}`);
        promesas.push(enviarSticker(telefono, url));
      } else {
        console.warn(`[STICKER] ID no reconocido: "${stickerId}"`);
      }
    }

    await Promise.all(promesas);

    // ── 6. Registrar para el resumen diario ───────────────────────────────
    registrarConversacion({
      telefono,
      ciudad:   lead?.ciudad   || null,
      motivo:   lead?.motivo   || null,
      tieneDNI: !!(lead?.dni_contacto),
      esCrisis: crisis.esCrisis,
      etapa:    contexto.etapa,
      esFiltrado: false,
    });
  } catch (err) {
    console.error(`[ERROR] Fallo procesando mensajes de ${telefono}:`, err.message);
    if (err.response) {
      console.error(
        `[API ERROR] status=${err.response.status} url=${err.config?.url}`,
        err.response.data
      );
    }
    pausarFollowup(telefono).catch(() => {});
  }
}

/**
 * POST /webhook
 * Recibe eventos de Evolution API.
 * Responde 200 de inmediato y acumula el mensaje en el buffer de debounce.
 * Después de 45s sin nuevos mensajes del mismo número, muestra "escribiendo..."
 * y procesa todos los mensajes acumulados como uno solo.
 */
router.post("/", (req, res) => {
  // 1. Solo procesar eventos de mensajes nuevos — ignorar status, delivery, etc.
  const evento = req.body?.event;
  if (evento && evento !== "messages.upsert") {
    return res.status(200).json({ status: "ignored", reason: `event:${evento}` });
  }

  const data = req.body?.data;

  if (!data) return res.status(200).json({ status: "ignored", reason: "no data" });

  // Mensajes salientes del propio número: normalmente se ignoran, PERO
  // interceptamos los stickers de control con los que el operador toma o
  // devuelve la conversación a Eli.
  if (data.key?.fromMe === true) {
    if (extraerTipoMensaje(data.message) === "sticker") manejarStickerControl(data);
    return res.status(200).json({ status: "ignored", reason: "fromMe" });
  }

  const remoteJid = data.key?.remoteJid || "";
  if (remoteJid.endsWith("@g.us")) return res.status(200).json({ status: "ignored", reason: "group" });

  // 2. Deduplicar por messageId — evita procesar el mismo mensaje dos veces
  const messageId = data.key?.id;
  if (messageId) {
    if (yaFueProcesado(messageId)) {
      return res.status(200).json({ status: "ignored", reason: "duplicate" });
    }
    marcarProcesado(messageId);
  }

  const telefono = extraerTelefono(remoteJid);
  const tipoMensaje = extraerTipoMensaje(data.message);
  const textoUsuario = extraerTexto(data.message);

  if (!telefono || !tipoMensaje) {
    return res.status(200).json({ status: "ignored", reason: "unsupported message type" });
  }

  // Si un humano tomó el control de este chat (sticker de pausa), Eli no
  // responde: descartamos cualquier respuesta encolada y no procesamos.
  if (estaEnAtencionHumana(telefono)) {
    console.log(`[HANDOFF] ${telefono} en atención humana — Eli no responde`);
    cancelarPendientes(telefono);
    return res.status(200).json({ status: "ignored", reason: "atencion humana" });
  }

  console.log(`[WEBHOOK] ${telefono} (${tipoMensaje}): "${textoUsuario || "—"}"`);

  // Agregar al buffer del usuario
  if (!pendingMessages.has(telefono)) {
    pendingMessages.set(telefono, { timer: null, mensajes: [] });
  }

  const pending = pendingMessages.get(telefono);
  pending.mensajes.push({ tipo: tipoMensaje, texto: textoUsuario, data });

  // Reiniciar el timer cada vez que llega un mensaje nuevo
  if (pending.timer) clearTimeout(pending.timer);

  const debounce = psicologoEnCache(telefono) ? DEBOUNCE_NOTA_MS : DEBOUNCE_MS;
  pending.timer = setTimeout(() => {
    const mensajesAcumulados = pending.mensajes;
    pendingMessages.delete(telefono);
    // El loop de typing lo arranca procesarMensajesAcumulados internamente
    procesarMensajesAcumulados(telefono, mensajesAcumulados);
  }, debounce);

  res.status(200).json({ status: "queued" });
});

module.exports = router;
