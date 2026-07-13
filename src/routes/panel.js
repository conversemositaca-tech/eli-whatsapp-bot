const express = require("express");
const router = express.Router();
const { enviarImagenUrl, enviarMensaje } = require("../services/wa");
const { buscarMemoria, crearMemoria } = require("../services/supabase");
const { obtenerStickersCapturados, listaEnAtencionHumana } = require("../services/handoff");

// Token de acceso — configurar ADMIN_TOKEN en .env
function verificarToken(req, res, next) {
  const token = req.query.token || req.body?.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).send("No autorizado. Verifica el token.");
  }
  next();
}

// ── GET /panel?token=xxx — formulario para Yazmin ─────────────────────────
router.get("/", verificarToken, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Eli — Iniciar contacto</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; background: #f0f4f8; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 420px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    h2 { color: #2d3748; margin-bottom: 6px; }
    p { color: #718096; font-size: 14px; margin-bottom: 24px; }
    label { display: block; font-size: 13px; color: #4a5568; margin-bottom: 4px; margin-top: 16px; font-weight: 600; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 15px; }
    input:focus { outline: none; border-color: #63b3ed; }
    button { margin-top: 24px; width: 100%; padding: 12px; background: #4299e1; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
    button:hover { background: #3182ce; }
    .hint { font-size: 12px; color: #a0aec0; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>🐘 Eli — Iniciar contacto</h2>
    <p>Para leads de redes sociales que dejaron su número pero no escribieron al bot.</p>
    <form method="POST">
      <input type="hidden" name="token" value="${req.query.token}">
      <label>Celular *</label>
      <input type="text" name="telefono" placeholder="51987654321" required>
      <div class="hint">Con código de país, sin + ni espacios</div>
      <label>Nombre (opcional)</label>
      <input type="text" name="nombre" placeholder="María García">
      <button type="submit">Enviar primer mensaje</button>
    </form>
  </div>
</body>
</html>`);
});

// ── POST /panel — enviar primer mensaje al lead ───────────────────────────
router.post("/", verificarToken, async (req, res) => {
  const { telefono, nombre } = req.body;

  if (!telefono) {
    return res.status(400).send("Falta el número de teléfono.");
  }

  try {
    // No reiniciar si ya hay conversación activa
    const memoriaExistente = await buscarMemoria(telefono);
    if (memoriaExistente) {
      return res.send(`⚠️ Ya existe una conversación activa con ${telefono}. No se envió nuevo mensaje para no interrumpir el flujo.`);
    }

    const nombreCorto = nombre ? nombre.trim().split(" ")[0] : null;
    const saludo = nombreCorto
      ? `Hola ${nombreCorto} 🩵 Soy Eli, asistente virtual de Ítaca Conversemos — Sede Piura.\n\nNos dejaste tu número y quería escribirte para contarte sobre nuestro servicio de atención psicológica. ¿Tienes unos minutos?`
      : `Hola 🩵 Soy Eli, asistente virtual de Ítaca Conversemos — Sede Piura.\n\nNos dejaste tu número y quería escribirte para contarte sobre nuestro servicio de atención psicológica. ¿Tienes unos minutos?`;

    // Enviar imagen de bienvenida
    if (process.env.IMG_BIENVENIDA) {
      await enviarImagenUrl(telefono, process.env.IMG_BIENVENIDA, "");
      await new Promise((r) => setTimeout(r, 800));
    }

    await enviarMensaje(telefono, saludo);

    // Crear memoria inicial para que Eli recuerde el contexto
    const historialInicial = [
      {
        role: "assistant",
        content: JSON.stringify({
          respuesta: saludo,
          imagenes: [],
          lead: { nombre_contacto: nombre || "", calificacion: null },
        }),
      },
    ];
    await crearMemoria(telefono, historialInicial);

    console.log(`[PANEL] Contacto iniciado con ${telefono} (${nombre || "sin nombre"})`);
    res.send(`✅ Mensaje enviado a ${telefono}${nombre ? ` (${nombre})` : ""}. Cuando respondan, Eli tomará el flujo automáticamente.`);
  } catch (err) {
    console.error("[PANEL] Error:", err.message);
    res.status(500).send(`Error: ${err.message}`);
  }
});

// ── GET /panel/stickers?token=xxx — calibrar stickers de control ──────────
// Muestra los últimos stickers propios detectados con su fileSha256, para
// copiarlos a STICKER_PAUSA_SHA256 / STICKER_REACTIVAR_SHA256 en .env.
router.get("/stickers", verificarToken, (req, res) => {
  const capturados = obtenerStickersCapturados();
  const pausados = listaEnAtencionHumana();

  const filas = capturados.length
    ? capturados
        .map(
          (c) => `<tr>
            <td>${c.at}</td>
            <td>${c.telefono}</td>
            <td><b>${c.rol}</b></td>
            <td class="mono">${c.sha}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="4">Aún no se detectó ningún sticker propio. Envía el sticker de control dentro de un chat y recarga.</td></tr>`;

  res.send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Eli — Calibrar stickers de control</title>
<style>
  body { font-family: sans-serif; background:#f0f4f8; padding:20px; color:#2d3748; }
  h2 { margin-bottom:4px; } p { color:#718096; font-size:14px; }
  table { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); margin-top:16px; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid #edf2f7; font-size:13px; }
  th { background:#4299e1; color:#fff; }
  .mono { font-family:monospace; word-break:break-all; }
  .box { background:#fff; border-radius:10px; padding:16px; margin-top:16px; font-size:13px; box-shadow:0 2px 12px rgba(0,0,0,.08); }
  code { background:#edf2f7; padding:2px 5px; border-radius:4px; }
</style></head>
<body>
  <h2>🐘 Calibrar stickers de control</h2>
  <p>Envía cada sticker dentro de un chat (desde el WhatsApp de Eli) y recarga esta página. Copia el <b>fileSha256</b> a <code>.env</code>.</p>
  <table>
    <thead><tr><th>Cuándo</th><th>Chat</th><th>Rol</th><th>fileSha256 (base64)</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="box">
    <b>Configuración en .env:</b><br>
    <code>STICKER_PAUSA_SHA256=&lt;hash del sticker que pausa a Eli&gt;</code><br>
    <code>STICKER_REACTIVAR_SHA256=&lt;hash del sticker que reactiva a Eli&gt;</code><br>
    <small>Puedes poner varios hashes separados por coma. Después de editar, redeploy.</small>
  </div>
  <div class="box">
    <b>Chats en atención humana ahora mismo:</b> ${pausados.length ? pausados.join(", ") : "ninguno"}
  </div>
</body></html>`);
});

module.exports = router;
