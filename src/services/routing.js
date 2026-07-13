const { enviarMensaje } = require("./wa");

/**
 * Deriva notificaciones a Yazmin (Piura) o Ayvi (Lima) según la ciudad del lead.
 *
 * Tipos:
 *   'NUEVO_LEAD'          — lead calificado por primera vez
 *   'LISTO_PARA_COORDINAR' — Eli ya recopiló DNI, listo para asignar horario y cobrar (= lead CERRADO)
 *   'NO_CERRADO'          — lead llegó a la oferta de la consulta y se quedó sin responder 3h (resumen ejecutivo)
 *   'RECONTACTO'          — lead frío, Eli envió seguimiento automático sin respuesta
 */
async function derivarLeadAAsistente(telefonoCliente, lead, tipo = "NUEVO_LEAD", resumen = "") {
  const ciudad = (lead.ciudad || "").toLowerCase();
  const esLima = ciudad === "lima";

  const numeroAsistente = esLima ? process.env.ASISTENTE_LIMA : process.env.ASISTENTE_PIURA;
  const nombreAsistente = esLima ? "Ayvi" : "Yazmin";
  const sede = esLima ? "LIMA" : "PIURA";

  if (!numeroAsistente) {
    console.warn(`[ROUTING] No está configurado ASISTENTE_${sede} en el .env`);
    return;
  }

  const construir = {
    NUEVO_LEAD:           construirNuevoLead,
    LISTO_PARA_COORDINAR: construirListoParaCoordinar,
    NO_CERRADO:           construirNoCerrado,
    RECONTACTO:           construirRecontacto,
  }[tipo] || construirNuevoLead;

  const mensaje = construir(telefonoCliente, lead, nombreAsistente, sede, resumen);

  await enviarMensaje(numeroAsistente, mensaje);
  console.log(`[ROUTING] Notificación ${tipo} enviada a ${nombreAsistente} (${sede}): ${numeroAsistente}`);
}

// ─────────────────────────────────────────────
// PLANTILLAS DE MENSAJES
// ─────────────────────────────────────────────

function construirNuevoLead(telefonoCliente, lead, nombreAsistente, sede, resumen) {
  const icono = {
    ALTO:  "🔴 ALTO  — cierre rápido probable",
    MEDIO: "🟡 MEDIO — requiere seguimiento",
    BAJO:  "🟢 BAJO  — baja probabilidad",
  }[lead.calificacion] || "⚪ Sin calificar";

  const esTercero = lead.para_quien && lead.para_quien !== "yo mismo";

  const lineas = [
    `🔔 *NUEVO LEAD — ÍTACA ${sede}*`,
    "",
    `📊 ${icono}`,
    "",
    `📱 WhatsApp: wa.me/${telefonoCliente}`,
    `👤 Contacto: ${lead.nombre_contacto || "—"}`,
  ];

  if (esTercero) lineas.push(`🧑‍⚕️ Paciente: ${lead.nombre_paciente || "—"} (${lead.para_quien})`);
  lineas.push(`🎂 Edad: ${lead.edad_paciente ?? "—"}`);
  lineas.push(`💬 Motivo: ${lead.motivo || "—"}`);
  if (lead.psicologo_sugerido) lineas.push(`👩‍⚕️ Psicólogo sugerido: ${lead.psicologo_sugerido}`);
  if (resumen) lineas.push("", `📝 Contexto: ${resumen}`);

  lineas.push("", "⏳ Eli está recopilando datos. Te avisaré cuando esté listo para coordinar.");

  return lineas.join("\n");
}

function construirListoParaCoordinar(telefonoCliente, lead, nombreAsistente, sede, resumen) {
  const esTercero = lead.para_quien && lead.para_quien !== "yo mismo";
  const nombre = lead.nombre_contacto || "el lead";

  const lineas = [
    `✅ *LISTO PARA COORDINAR — ÍTACA ${sede}*`,
    "",
    `${nombre} confirmó que quiere agendar y Eli ya recopiló sus datos.`,
    "",
    `📱 WhatsApp: wa.me/${telefonoCliente}`,
    `👤 Contacto: ${lead.nombre_contacto || "—"}`,
  ];

  if (lead.dni_contacto) lineas.push(`🪪 DNI contacto: ${lead.dni_contacto}`);
  if (esTercero) {
    lineas.push(`🧑‍⚕️ Paciente: ${lead.nombre_paciente || "—"} (${lead.para_quien})`);
    if (lead.dni_paciente) lineas.push(`🪪 DNI paciente: ${lead.dni_paciente}`);
  }
  lineas.push(`🎂 Edad: ${lead.edad_paciente ?? "—"}`);
  lineas.push(`💬 Motivo: ${lead.motivo || "—"}`);
  if (lead.psicologo_sugerido) lineas.push(`👩‍⚕️ Psicólogo sugerido: ${lead.psicologo_sugerido}`);
  if (resumen) lineas.push("", `📝 Contexto: ${resumen}`);

  lineas.push("", "👉 *Siguiente paso:* envíale horarios disponibles y coordina el pago de S/50.");

  return lineas.join("\n");
}

function construirNoCerrado(telefonoCliente, lead, nombreAsistente, sede, resumen) {
  const esTercero = lead.para_quien && lead.para_quien !== "yo mismo";
  const nombre = lead.nombre_contacto || "este lead";

  const icono = {
    ALTO:  "🔴 ALTO",
    MEDIO: "🟡 MEDIO",
    BAJO:  "🟢 BAJO",
  }[lead.calificacion] || "⚪ Sin calificar";

  const lineas = [
    `🟠 *LEAD NO CERRADO — ÍTACA ${sede}*`,
    "",
    `${nombre} llegó a la oferta de la primera consulta pero lleva 3 horas sin responder a los recordatorios automáticos de Eli.`,
    "",
    `📊 ${icono}`,
    `📱 WhatsApp: wa.me/${telefonoCliente}`,
    `👤 Contacto: ${nombre}`,
  ];

  if (esTercero) lineas.push(`🧑‍⚕️ Paciente: ${lead.nombre_paciente || "—"} (${lead.para_quien})`);
  lineas.push(`🎂 Edad: ${lead.edad_paciente ?? "—"}`);
  lineas.push(`💬 Motivo: ${lead.motivo || "—"}`);
  if (lead.psicologo_sugerido) lineas.push(`👩‍⚕️ Psicólogo sugerido: ${lead.psicologo_sugerido}`);
  if (resumen) lineas.push("", `📝 Resumen: ${resumen}`);

  lineas.push("", "👉 *Considera escribirle tú directamente* — Eli seguirá con los recordatorios automáticos pero un toque humano puede cambiar la balanza.");

  return lineas.join("\n");
}

function construirRecontacto(telefonoCliente, lead, nombreAsistente, sede, resumen) {
  const nombre = lead.nombre_contacto || lead["NOMBRES"] || "este lead";
  const motivo = lead.motivo          || lead["MOTIVO"]  || "—";
  const estado = lead.calificacion    || lead["ESTADO"]  || "";

  const icono = { ALTO: "🔴 ALTO", MEDIO: "🟡 MEDIO", BAJO: "🟢 BAJO" }[estado] || "⚪";

  const lineas = [
    `⚠️ *RECONTACTO PENDIENTE — ÍTACA ${sede}*`,
    "",
    `Eli envió seguimiento automático a *${nombre}* pero no respondió.`,
    "",
    `📱 WhatsApp: wa.me/${telefonoCliente}`,
    `👤 Contacto: ${nombre}`,
    `💬 Motivo: ${motivo}`,
    `📊 Estado: ${icono}`,
    "",
    "👉 *Escríbele o llámala directamente para no perder el lead.*",
  ];

  return lineas.join("\n");
}

module.exports = { derivarLeadAAsistente };
