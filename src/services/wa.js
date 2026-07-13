/**
 * Selector de proveedor de WhatsApp. Toda la app manda/recibe a través de aquí.
 *   WHATSAPP_PROVIDER=cloud   → WhatsApp Cloud API (Meta), con botones interactivos.
 *   (cualquier otro valor)    → Evolution API (Baileys), el actual.
 *
 * Así se migra sin romper: mientras la variable no sea "cloud", todo sigue igual.
 */
const ES_CLOUD = process.env.WHATSAPP_PROVIDER === "cloud";

module.exports = ES_CLOUD ? require("./whatsappCloud") : require("./evolution");
module.exports.ES_CLOUD = ES_CLOUD;
