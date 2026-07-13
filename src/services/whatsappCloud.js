/**
 * Capa de WhatsApp Cloud API (Meta) — envío y utilidades.
 *
 * Es el reemplazo OFICIAL de Evolution (Baileys). La diferencia clave: la Cloud
 * API sí soporta **botones interactivos** y listas (los que se tocan, tipo WIN).
 *
 * Se activa con WHATSAPP_PROVIDER=cloud. Requiere en el entorno:
 *   WHATSAPP_TOKEN            token de acceso (usuario de sistema, permanente)
 *   WHATSAPP_PHONE_NUMBER_ID  id del número (del panel de Meta)
 *   WHATSAPP_API_VERSION      opcional, por defecto v20.0
 *
 * Expone la MISMA interfaz que evolution.js (enviarMensaje, extraerTexto, …) para
 * que el webhook y los servicios funcionen sin cambios, más `enviarBotones` /
 * `enviarLista` para la UX de botones.
 */
const axios = require("axios");

const VERSION = process.env.WHATSAPP_API_VERSION || "v20.0";
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;

const api = axios.create({
  baseURL: `https://graph.facebook.com/${VERSION}`,
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  timeout: 25000,
});

// El número peruano en Cloud API va sin "+", solo dígitos (51XXXXXXXXX).
function normalizarTo(telefono) {
  return String(telefono || "").replace(/\D/g, "");
}

async function _enviar(payload) {
  const { data } = await api.post(`/${PHONE_ID}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    ...payload,
  });
  return data;
}

// ── Envío de texto ──────────────────────────────────────────────────────────
async function enviarMensaje(telefono, texto) {
  if (!texto || !texto.trim()) return null;
  return _enviar({ to: normalizarTo(telefono), type: "text", text: { body: texto, preview_url: true } });
}

// WhatsApp corta los textos muy largos: los partimos en trozos de ~3500 chars,
// respetando saltos de línea, y los mandamos en orden.
async function enviarMensajeChunked(telefono, texto) {
  const MAX = 3500;
  const t = (texto || "").trim();
  if (!t) return;
  if (t.length <= MAX) return enviarMensaje(telefono, t);
  const bloques = [];
  let actual = "";
  for (const linea of t.split("\n")) {
    if ((actual + "\n" + linea).length > MAX && actual) { bloques.push(actual); actual = linea; }
    else { actual = actual ? actual + "\n" + linea : linea; }
  }
  if (actual) bloques.push(actual);
  for (const b of bloques) { await enviarMensaje(telefono, b); }
}

// ── Botones interactivos (hasta 3) ────────────────────────────────────────────
// botones = [{ id, title }]. `title` máx 20 caracteres (límite de WhatsApp).
async function enviarBotones(telefono, texto, botones) {
  const buttons = (botones || []).slice(0, 3).map((b) => ({
    type: "reply",
    reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) },
  }));
  if (!buttons.length) return enviarMensaje(telefono, texto);
  // Meta limita el cuerpo interactivo a 1024 caracteres.
  const body = String(texto || "").slice(0, 1024);
  return _enviar({
    to: normalizarTo(telefono),
    type: "interactive",
    interactive: { type: "button", body: { text: body }, action: { buttons } },
  });
}

// ── Lista interactiva (para más de 3 opciones) ────────────────────────────────
// opciones = [{ id, title, description? }]. `boton` = texto del botón que abre la lista.
async function enviarLista(telefono, texto, boton, opciones, titulo = "") {
  const rows = (opciones || []).slice(0, 10).map((o) => ({
    id: String(o.id).slice(0, 200),
    title: String(o.title).slice(0, 24),
    ...(o.description ? { description: String(o.description).slice(0, 72) } : {}),
  }));
  if (!rows.length) return enviarMensaje(telefono, texto);
  return _enviar({
    to: normalizarTo(telefono),
    type: "interactive",
    interactive: {
      type: "list",
      ...(titulo ? { header: { type: "text", text: titulo.slice(0, 60) } } : {}),
      body: { text: String(texto || "").slice(0, 1024) },
      action: { button: String(boton || "Elegir").slice(0, 20), sections: [{ rows }] },
    },
  });
}

// ── Imagen por URL ─────────────────────────────────────────────────────────────
async function enviarImagenUrl(telefono, url, caption = "") {
  if (!url) return null;
  return _enviar({ to: normalizarTo(telefono), type: "image", image: { link: url, ...(caption ? { caption } : {}) } });
}

// Cloud API no envía stickers por URL fácilmente; mandamos la imagen como fallback.
async function enviarSticker(telefono, url) {
  return enviarImagenUrl(telefono, url, "");
}

// ── Descargar media entrante (audio/imagen) por su media-id ───────────────────
// En Cloud API el mensaje trae un `id` de media; se pide la URL y luego se baja
// con el token. `ref` puede ser el media-id (string) o el objeto message entrante.
async function descargarMediaBase64(ref) {
  const mediaId = typeof ref === "string" ? ref : (ref?.mediaId || ref?.id);
  if (!mediaId) throw new Error("Sin media-id para descargar");
  const meta = await api.get(`/${mediaId}`);
  const url = meta.data && meta.data.url;
  if (!url) throw new Error("Media sin URL");
  const bin = await axios.get(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    responseType: "arraybuffer",
    timeout: 30000,
  });
  const mimetype = bin.headers["content-type"] || meta.data.mime_type || "application/octet-stream";
  return { base64: Buffer.from(bin.data).toString("base64"), mimetype };
}

// ── Presencia ("escribiendo…"): Cloud API no la soporta → no-ops compatibles ───
function iniciarPresencia() { return { detener() {} }; }
function presenciaInmediata() {}
function simularEscribiendo() {}

// ── Parseo del mensaje ENTRANTE (payload de Meta) ─────────────────────────────
// Meta manda: entry[].changes[].value.messages[]. Devolvemos una lista normalizada
// con la MISMA forma que espera el webhook: { telefono, tipo, texto, messageId,
// fromMe, botonId, mediaId }.
function parsearEntrante(body) {
  const out = [];
  const entries = body && Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    for (const ch of entry.changes || []) {
      const value = ch.value || {};
      for (const m of value.messages || []) {
        const telefono = m.from; // ya viene en dígitos (51XXXXXXXXX)
        const base = { telefono, messageId: m.id, fromMe: false, botonId: null, mediaId: null };
        if (m.type === "text") {
          out.push({ ...base, tipo: "texto", texto: m.text && m.text.body });
        } else if (m.type === "interactive") {
          const it = m.interactive || {};
          const r = it.button_reply || it.list_reply || {};
          out.push({ ...base, tipo: "texto", texto: r.title || "", botonId: r.id || null });
        } else if (m.type === "audio" || m.type === "voice") {
          out.push({ ...base, tipo: "audio", texto: "", mediaId: (m.audio || m.voice || {}).id });
        } else if (m.type === "image") {
          out.push({ ...base, tipo: "imagen", texto: (m.image && m.image.caption) || "", mediaId: (m.image || {}).id });
        } else if (m.type === "sticker") {
          out.push({ ...base, tipo: "sticker", texto: "", mediaId: (m.sticker || {}).id });
        }
        // otros tipos (ubicación, contactos…) se ignoran por ahora
      }
    }
  }
  return out;
}

// Compatibilidad con el webhook viejo (por si algún servicio los importa):
const extraerTelefono = (jid) => String(jid || "").replace(/\D/g, "");
const extraerTexto = (m) => (m && m.texto) || "";
const extraerTipoMensaje = (m) => (m && m.tipo) || null;

module.exports = {
  enviarMensaje, enviarMensajeChunked, enviarBotones, enviarLista,
  enviarImagenUrl, enviarSticker, descargarMediaBase64,
  iniciarPresencia, presenciaInmediata, simularEscribiendo,
  parsearEntrante, extraerTelefono, extraerTexto, extraerTipoMensaje,
};
