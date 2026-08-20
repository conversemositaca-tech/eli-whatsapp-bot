/**
 * Cómo contactar a una persona que escribe a Eli.
 *
 * WhatsApp migró los chats 1-a-1 a identidades opacas (@lid): esos dígitos son
 * un identificador interno, NO un teléfono. Sirven para reconocer al contacto y
 * para responderle, pero no para que una coordinadora lo llame ni para un wa.me.
 * Cuando pasa eso, Eli le pide el celular a la persona y queda en
 * lead.telefono_contacto; estas funciones deciden qué número mostrar.
 */

/** Un identificador que no tiene forma de teléfono es una identidad @lid. */
function esIdentificadorOpaco(id) {
  return !/^\d{8,13}$/.test(String(id || ""));
}

/**
 * Número con el que SÍ se puede contactar a la persona, o "" si no hay ninguno.
 * Los celulares peruanos de 9 dígitos se completan con el 51.
 */
function numeroUtil(telefonoCliente, lead = {}) {
  if (!esIdentificadorOpaco(telefonoCliente)) return String(telefonoCliente);

  const dado = String(lead.telefono_contacto || "").replace(/\D/g, "");
  if (!dado) return "";
  return dado.length === 9 ? `51${dado}` : dado;
}

/** Línea "📱 WhatsApp: ..." para los avisos a coordinadoras y a Gabriela. */
function lineaContacto(telefonoCliente, lead = {}) {
  if (!esIdentificadorOpaco(telefonoCliente)) {
    return `📱 WhatsApp: wa.me/${telefonoCliente}`;
  }
  const numero = numeroUtil(telefonoCliente, lead);
  if (numero) return `📱 WhatsApp: wa.me/${numero} (el número que dio en el chat)`;
  return "📱 WhatsApp: ⚠️ WhatsApp no entrega el número de este contacto — respóndele desde el chat de Eli";
}

module.exports = { esIdentificadorOpaco, numeroUtil, lineaContacto };
