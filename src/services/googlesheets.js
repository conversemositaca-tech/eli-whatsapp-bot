const axios = require("axios");
const { numeroUtil } = require("../utils/contacto");

function getUrl(ciudad) {
  return (ciudad || "").toLowerCase() === "lima"
    ? process.env.SHEETS_LIMA_URL
    : process.env.SHEETS_PIURA_URL;
}

async function postSheet(url, payload) {
  const encodedPayload = encodeURIComponent(JSON.stringify(payload));
  await axios.get(`${url}?payload=${encodedPayload}`, { timeout: 25000 });
}

/**
 * Registra o actualiza un lead en la pestaña LEADS del Sheet correcto.
 * Solo se llama cuando el lead ya tiene DNI.
 */

// Cuando WhatsApp no entrega el número, la columna celular lleva un
// identificador interno: el número real de la persona va en las notas.
function celUtil(telefono, lead) {
  const real = numeroUtil(telefono, lead);
  return real && real !== telefono ? `Cel: ${real}` : "";
}

async function registrarLeadEnSheets(telefono, lead, notas = "") {
  const url = getUrl(lead.ciudad);
  if (!url) {
    console.warn(`[SHEETS] URL no configurada para ciudad: ${lead.ciudad || "sin ciudad"}`);
    return;
  }

  const dniParts = [lead.dni_contacto, lead.dni_paciente].filter(Boolean);

  const payload = {
    accion:    "leads",
    celular:   telefono,
    nombre:    lead.nombre_contacto    || "",
    paciente:  (lead.nombre_paciente && lead.nombre_paciente !== lead.nombre_contacto)
                 ? lead.nombre_paciente : "",
    edad:      lead.edad_paciente      ? String(lead.edad_paciente) : "",
    distrito:  lead.ciudad             || "",
    dni:       dniParts.join(" | "),
    psicologo: lead.psicologo_sugerido || "",
    notas:     [celUtil(telefono, lead), lead.motivo, notas].filter(Boolean).join(" — "),
  };

  try {
    await postSheet(url, payload);
    console.log(`[SHEETS] Lead registrado — ${telefono} (${lead.ciudad || "?"})`);
  } catch (err) {
    console.error(`[SHEETS] Error al registrar lead:`, err.message);
  }
}

/**
 * Registra o actualiza un lead en la pestaña PIPELINE del Sheet correcto.
 * Se llama cada vez que hay motivo + ciudad, sin necesidad de DNI.
 * Hace upsert: si el celular ya existe, actualiza la fila; si no, la crea.
 */
async function registrarLeadEnPipeline(telefono, lead) {
  const url = getUrl(lead.ciudad);
  if (!url) {
    console.warn(`[PIPELINE] URL no configurada para ciudad: ${lead.ciudad || "sin ciudad"}`);
    return;
  }

  const dniParts = [lead.dni_contacto, lead.dni_paciente].filter(Boolean);

  const payload = {
    accion:       "pipeline",
    celular:      telefono,
    nombre:       lead.nombre_contacto  || "",
    ciudad:       lead.ciudad           || "",
    calificacion: lead.calificacion     || "",
    motivo:       lead.motivo           || "",
    dni:          dniParts.join(" | "),
    psicologo:    lead.psicologo_sugerido || "",
  };

  try {
    await postSheet(url, payload);
    console.log(`[PIPELINE] Lead actualizado — ${telefono} (${lead.ciudad || "?"})`);
  } catch (err) {
    console.error(`[PIPELINE] Error al actualizar pipeline:`, err.message);
  }
}

module.exports = { registrarLeadEnSheets, registrarLeadEnPipeline };
