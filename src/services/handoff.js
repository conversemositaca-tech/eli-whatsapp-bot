/**
 * Traspaso Eli ↔ humano.
 *
 * El operador (Gabriela / Mirai) puede tomar el control de una conversación
 * enviando un STICKER de control dentro del mismo chat del lead:
 *   • Sticker de PAUSA     → Eli se calla; el humano sigue a mano.
 *   • Sticker de REACTIVAR → Eli retoma la conversación automática.
 *
 * Los stickers se reconocen por su fileSha256 (hash estable del archivo del
 * sticker). Los hashes se configuran en .env:
 *   STICKER_PAUSA_SHA256     = <base64>[,<base64>...]
 *   STICKER_REACTIVAR_SHA256 = <base64>[,<base64>...]
 * (se admite lista separada por comas por si un mismo sticker produce más de
 * un hash entre dispositivos).
 *
 * Estado en memoria (Set) para chequeo instantáneo en el webhook, respaldado
 * en Supabase (paso_followup=9) para sobrevivir redeploys.
 */

const {
  marcarAtencionHumana,
  terminarAtencionHumana,
  listarChatsEnAtencionHumana,
} = require("./supabase");

// ── Estado: chats donde un humano tomó el control ─────────────────────────
const enAtencionHumana = new Set();

/**
 * Carga desde Supabase los chats que quedaron en atención humana antes de un
 * reinicio/redeploy, para no volver a responderles automáticamente.
 */
async function cargarEstadoInicial() {
  try {
    const telefonos = await listarChatsEnAtencionHumana();
    telefonos.forEach((t) => enAtencionHumana.add(t));
    if (telefonos.length) {
      console.log(`[HANDOFF] ${telefonos.length} chat(s) en atención humana restaurados`);
    }
  } catch (e) {
    console.warn(`[HANDOFF] No se pudo cargar el estado inicial: ${e.message}`);
  }
}

function estaEnAtencionHumana(telefono) {
  return enAtencionHumana.has(telefono);
}

async function pausarAtencion(telefono) {
  enAtencionHumana.add(telefono);
  await marcarAtencionHumana(telefono);
}

async function reactivarAtencion(telefono) {
  enAtencionHumana.delete(telefono);
  await terminarAtencionHumana(telefono);
}

function listaEnAtencionHumana() {
  return Array.from(enAtencionHumana);
}

// ── Config de stickers de control ─────────────────────────────────────────
function normalizarSha(sha) {
  // Ignoramos espacios y el padding "=" final para que el match sea tolerante.
  return (sha || "").toString().trim().replace(/=+$/, "");
}

function parseListaSha(env) {
  return new Set(
    (env || "")
      .split(",")
      .map((s) => normalizarSha(s))
      .filter(Boolean)
  );
}

const STICKERS_PAUSA = parseListaSha(process.env.STICKER_PAUSA_SHA256);
const STICKERS_REACTIVAR = parseListaSha(process.env.STICKER_REACTIVAR_SHA256);

function esStickerPausa(sha) {
  return STICKERS_PAUSA.has(normalizarSha(sha));
}

function esStickerReactivar(sha) {
  return STICKERS_REACTIVAR.has(normalizarSha(sha));
}

// ── Buffer de calibración ──────────────────────────────────────────────────
// Guarda los últimos stickers propios vistos, con su hash, para copiarlos a
// .env la primera vez. Se consulta desde GET /panel/stickers?token=...
const capturados = [];
const MAX_CAPTURA = 20;

function registrarStickerCapturado(telefono, sha) {
  let hex = "";
  try {
    hex = Buffer.from(sha, "base64").toString("hex");
  } catch {
    /* ignorar */
  }
  capturados.unshift({ telefono, sha, hex, at: new Date().toISOString() });
  if (capturados.length > MAX_CAPTURA) capturados.pop();
}

function obtenerStickersCapturados() {
  return capturados.map((c) => ({
    ...c,
    rol: esStickerPausa(c.sha)
      ? "PAUSA"
      : esStickerReactivar(c.sha)
        ? "REACTIVAR"
        : "(sin asignar)",
  }));
}

module.exports = {
  cargarEstadoInicial,
  estaEnAtencionHumana,
  pausarAtencion,
  reactivarAtencion,
  listaEnAtencionHumana,
  esStickerPausa,
  esStickerReactivar,
  registrarStickerCapturado,
  obtenerStickersCapturados,
};
