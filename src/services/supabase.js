const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn("[SUPABASE] Faltan SUPABASE_URL o SUPABASE_KEY en .env");
}

// Node 18 no trae WebSocket nativo; el cliente Realtime de Supabase lo
// requiere al inicializarse aunque no lo usemos. Pasamos ws como transport.
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

const TABLA_LEADS = "leads_conversemos";
const TABLA_CHATS = "chats_conversemos";

function lanzarSiError(error, contexto) {
  if (error) {
    const err = new Error(`[SUPABASE ${contexto}] ${error.message}`);
    err.cause = error;
    throw err;
  }
}

const RESUMEN_REGEX = /\[RESUMEN DE CONVERSACIÓN ANTERIOR: (.+?)\]/s;

/**
 * Reconstruye el historial estilo OpenAI a partir de las filas de chats_conversemos
 * + el resumen guardado en leads_conversemos.
 * Devuelve { recordId, history } o null si no hay historia.
 */
async function buscarMemoria(telefono) {
  const { data: chats, error: errChats } = await supabase
    .from(TABLA_CHATS)
    .select("message_content, assistant_response, date_time")
    .eq("user_id", telefono)
    .order("date_time", { ascending: false })
    .limit(10);
  lanzarSiError(errChats, "buscarMemoria.chats");

  if (!chats || chats.length === 0) return null;
  chats.reverse();

  const { data: lead, error: errLead } = await supabase
    .from(TABLA_LEADS)
    .select("resumen")
    .eq("id_usuario", telefono)
    .maybeSingle();
  lanzarSiError(errLead, "buscarMemoria.lead");

  const history = [];
  if (lead?.resumen) {
    history.push({
      role: "system",
      content: `[RESUMEN DE CONVERSACIÓN ANTERIOR: ${lead.resumen}]`,
    });
  }
  for (const row of chats) {
    if (row.message_content) {
      history.push({ role: "user", content: row.message_content });
    }
    if (row.assistant_response) {
      history.push({ role: "assistant", content: row.assistant_response });
    }
  }

  return { recordId: telefono, history };
}

/**
 * Guarda el último intercambio (user → assistant) como una fila en chats_conversemos.
 * Si la historia trae un mensaje system con [RESUMEN ...], lo persiste en leads_conversemos.resumen.
 */
async function guardarUltimoIntercambio(telefono, history) {
  let inicio = 0;
  let huboResumen = false;

  if (history[0]?.role === "system") {
    const match = history[0].content?.match(RESUMEN_REGEX);
    if (match) {
      const { error } = await supabase
        .from(TABLA_LEADS)
        .update({
          resumen: match[1],
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq("id_usuario", telefono);
      lanzarSiError(error, "guardarUltimoIntercambio.resumen");
      huboResumen = true;
    }
    inicio = 1;
  }

  if (huboResumen) {
    const { error: errDel } = await supabase
      .from(TABLA_CHATS)
      .delete()
      .eq("user_id", telefono);
    lanzarSiError(errDel, "guardarUltimoIntercambio.purge");

    const rows = [];
    const baseTime = Date.now();
    for (let i = inicio; i < history.length; i++) {
      if (history[i].role === "user") {
        const asst = history[i + 1]?.role === "assistant" ? history[i + 1].content : null;
        rows.push({
          user_id: telefono,
          message_content: history[i].content,
          assistant_response: asst,
          date_time: new Date(baseTime + rows.length).toISOString(),
        });
        if (asst !== null) i++;
      } else if (history[i].role === "assistant") {
        rows.push({
          user_id: telefono,
          message_content: null,
          assistant_response: history[i].content,
          date_time: new Date(baseTime + rows.length).toISOString(),
        });
      }
    }
    if (rows.length > 0) {
      const { error } = await supabase.from(TABLA_CHATS).insert(rows);
      lanzarSiError(error, "guardarUltimoIntercambio.reinsert");
    }
    return telefono;
  }

  let ultimoUser = null;
  let ultimoAssistant = null;
  for (let i = history.length - 1; i >= inicio; i--) {
    const m = history[i];
    if (!ultimoAssistant && m.role === "assistant") ultimoAssistant = m.content;
    else if (!ultimoUser && m.role === "user") ultimoUser = m.content;
    if (ultimoUser && ultimoAssistant) break;
  }

  if (!ultimoUser && !ultimoAssistant) return telefono;

  const { error } = await supabase.from(TABLA_CHATS).insert({
    user_id: telefono,
    message_content: ultimoUser,
    assistant_response: ultimoAssistant,
    date_time: new Date().toISOString(),
  });
  lanzarSiError(error, "guardarUltimoIntercambio.insert");

  return telefono;
}

async function crearMemoria(telefono, history) {
  return guardarUltimoIntercambio(telefono, history);
}

async function actualizarMemoria(recordId, history) {
  return guardarUltimoIntercambio(recordId, history);
}

/**
 * Crea o actualiza un lead. Devuelve { isNew, dniNuevo, recordId }.
 */
async function registrarOActualizarLead(telefono, lead) {
  const ahora = new Date().toISOString();

  const fields = {
    id_usuario:         telefono,
    nombre_cliente:     lead.nombre_contacto   || null,
    paciente:           lead.nombre_paciente   || null,
    edad:               lead.edad_paciente ? Number(lead.edad_paciente) : null,
    para_quien:         lead.para_quien        || null,
    sede:               lead.ciudad            || null,
    motivo:             lead.motivo            || null,
    psicologo_asignado: lead.psicologo_sugerido || null,
    precalificacion:    lead.calificacion      || "NUEVO",
    fecha_actualizacion: ahora,
    dni_contacto:       lead.dni_contacto      || null,
    dni_paciente:       lead.dni_paciente      || null,
  };

  const { data: existing, error: errSel } = await supabase
    .from(TABLA_LEADS)
    .select("id_lead, dni_contacto")
    .eq("id_usuario", telefono)
    .maybeSingle();
  lanzarSiError(errSel, "registrarOActualizarLead.select");

  if (existing) {
    const dniNuevo = !existing.dni_contacto && !!fields.dni_contacto;
    // paso_followup NO se toca en updates ordinarios: el contador es acumulativo
    // por conversación aunque el usuario haya respondido entremedio. Solo se sube a 8
    // cuando recién aparece el DNI (lead cerrado → detiene la secuencia).
    const updateFields = dniNuevo ? { ...fields, paso_followup: 8 } : fields;
    const { error } = await supabase
      .from(TABLA_LEADS)
      .update(updateFields)
      .eq("id_lead", existing.id_lead);
    lanzarSiError(error, "registrarOActualizarLead.update");
    return { isNew: false, dniNuevo, recordId: existing.id_lead };
  }

  fields.fecha = ahora;
  fields.paso_followup = fields.dni_contacto ? 8 : 0;
  const { data: created, error } = await supabase
    .from(TABLA_LEADS)
    .insert(fields)
    .select("id_lead")
    .single();
  lanzarSiError(error, "registrarOActualizarLead.insert");

  return { isNew: true, dniNuevo: !!fields.dni_contacto, recordId: created.id_lead };
}

/**
 * Crea un row mínimo apenas el usuario manda el primer mensaje, o refresca
 * fecha_actualizacion si ya existe (reinicia el contador de followup).
 */
async function crearLeadInicialSiNoExiste(telefono) {
  const ahora = new Date().toISOString();

  const { data: existing, error: errSel } = await supabase
    .from(TABLA_LEADS)
    .select("id_lead")
    .eq("id_usuario", telefono)
    .maybeSingle();
  lanzarSiError(errSel, "crearLeadInicialSiNoExiste.select");

  if (existing) {
    const { error } = await supabase
      .from(TABLA_LEADS)
      .update({ fecha_actualizacion: ahora })
      .eq("id_lead", existing.id_lead);
    lanzarSiError(error, "crearLeadInicialSiNoExiste.update");
    return;
  }

  const { error } = await supabase.from(TABLA_LEADS).insert({
    id_usuario:          telefono,
    precalificacion:     "NUEVO",
    fecha:               ahora,
    fecha_actualizacion: ahora,
    paso_followup:       0,
  });
  lanzarSiError(error, "crearLeadInicialSiNoExiste.insert");
}

/**
 * Devuelve los leads activos en seguimiento, mapeados al shape que espera
 * followup.js (heredado de Airtable: { id, fields: { CELULAR, NOMBRES, ... } }).
 */
async function obtenerLeadsEnFollowup() {
  const { data, error } = await supabase
    .from(TABLA_LEADS)
    .select("id_lead, id_usuario, nombre_cliente, paciente, edad, para_quien, sede, motivo, psicologo_asignado, paso_followup, fecha_actualizacion, precalificacion, resumen")
    .lt("paso_followup", 8)
    .not("id_usuario", "is", null);
  lanzarSiError(error, "obtenerLeadsEnFollowup");

  return (data || []).map((row) => ({
    id: row.id_lead,
    fields: {
      CELULAR:            row.id_usuario,
      NOMBRES:            row.nombre_cliente,
      PACIENTE:           row.paciente,
      EDAD:               row.edad,
      PARA_QUIEN:         row.para_quien,
      SEDE:               row.sede,
      MOTIVO:             row.motivo,
      PSICOLOGO_ASIGNADO: row.psicologo_asignado,
      PASO_FOLLOWUP:      row.paso_followup ?? 0,
      ult_actividad_bot:  row.fecha_actualizacion,
      ESTADO:             row.precalificacion,
      RESUMEN:            row.resumen,
    },
  }));
}

async function actualizarPasoFollowup(recordId, nuevoPaso) {
  const { error } = await supabase
    .from(TABLA_LEADS)
    .update({
      paso_followup:       nuevoPaso,
      fecha_actualizacion: new Date().toISOString(),
    })
    .eq("id_lead", recordId);
  lanzarSiError(error, "actualizarPasoFollowup");
}

// Setea paso_followup=8 para sacar al lead de la cola de recontacto.
// Se usa cuando GPT-4o detecta rechazo explícito ("no me interesa", "no insistas", etc).
async function pausarFollowup(telefono) {
  const { error } = await supabase
    .from(TABLA_LEADS)
    .update({ paso_followup: 8 })
    .eq("id_usuario", telefono);
  lanzarSiError(error, "pausarFollowup");
}

// ── Atención humana (traspaso a un operador) ──────────────────────────────
// Cuando el operador toma el control de un chat (sticker de pausa), Eli deja
// de responder. Reutilizamos paso_followup con el centinela 9 = "un humano
// está atendiendo": queda excluido del followup (la query usa < 8) y el estado
// sobrevive redeploys. Al reactivar, vuelve a 8 (fuera del recontacto: un
// humano ya intervino este lead).
const PASO_ATENCION_HUMANA = 9;
const PASO_FUERA_FOLLOWUP = 8;

async function marcarAtencionHumana(telefono) {
  // Aseguramos que exista la fila del lead antes de marcarla.
  await crearLeadInicialSiNoExiste(telefono);
  const { error } = await supabase
    .from(TABLA_LEADS)
    .update({ paso_followup: PASO_ATENCION_HUMANA })
    .eq("id_usuario", telefono);
  lanzarSiError(error, "marcarAtencionHumana");
}

async function terminarAtencionHumana(telefono) {
  const { error } = await supabase
    .from(TABLA_LEADS)
    .update({ paso_followup: PASO_FUERA_FOLLOWUP })
    .eq("id_usuario", telefono)
    .eq("paso_followup", PASO_ATENCION_HUMANA); // solo si seguía en atención humana
  lanzarSiError(error, "terminarAtencionHumana");
}

async function listarChatsEnAtencionHumana() {
  const { data, error } = await supabase
    .from(TABLA_LEADS)
    .select("id_usuario")
    .eq("paso_followup", PASO_ATENCION_HUMANA)
    .not("id_usuario", "is", null);
  lanzarSiError(error, "listarChatsEnAtencionHumana");
  return (data || []).map((r) => r.id_usuario);
}

module.exports = {
  buscarMemoria,
  crearMemoria,
  actualizarMemoria,
  registrarOActualizarLead,
  crearLeadInicialSiNoExiste,
  obtenerLeadsEnFollowup,
  actualizarPasoFollowup,
  pausarFollowup,
  marcarAtencionHumana,
  terminarAtencionHumana,
  listarChatsEnAtencionHumana,
};
