// Imprime las plantillas de notificación que se le enviarían a Yazmin/Ayvi
// para los 3 escenarios: CERRADO, NO_CERRADO, NUEVO_LEAD.
// No envía nada — solo simula los mensajes.

// Mock evolution antes de cargar routing
require.cache[require.resolve("../src/services/evolution")] = {
  exports: { enviarMensaje: async () => {} },
};

const routing = require("../src/services/routing");

// Accedo a las plantillas internas hackeando un require que las exponga.
// Reabro el archivo y re-evalúo solo las funciones de plantilla.
const fs = require("fs");
const path = require("path");
const codigoRouting = fs.readFileSync(
  path.join(__dirname, "../src/services/routing.js"),
  "utf8"
);
// Extraer cada función con regex
function extraerFn(nombre) {
  const re = new RegExp(`function ${nombre}[\\s\\S]+?\\n\\}\\n`, "m");
  const m = codigoRouting.match(re);
  return m ? eval(`(${m[0]})`) : null;
}
const construirNuevoLead           = extraerFn("construirNuevoLead");
const construirListoParaCoordinar  = extraerFn("construirListoParaCoordinar");
const construirNoCerrado           = extraerFn("construirNoCerrado");

const leadBase = {
  nombre_contacto: "María García",
  nombre_paciente: "María García",
  edad_paciente: 32,
  para_quien: "yo mismo",
  ciudad: "Piura",
  motivo: "ansiedad y problemas de sueño desde hace 3 meses",
  psicologo_sugerido: "Ps. Emma o Ps. Sofía",
  calificacion: "ALTO",
};

const leadCerrado = { ...leadBase, dni_contacto: "12345678" };

const leadNoCerrado = {
  nombre_contacto: "José Pérez",
  nombre_paciente: "su mamá Rosa",
  edad_paciente: 65,
  para_quien: "madre",
  ciudad: "Lima",
  motivo: "depresión profunda tras quedarse viuda",
  psicologo_sugerido: "Ps. Mayra o Ps. Bruno",
  calificacion: "MEDIO",
};

console.log("═".repeat(60));
console.log("  ESCENARIO 1 — NUEVO_LEAD (Piura, ya existía)");
console.log("═".repeat(60) + "\n");
console.log(construirNuevoLead("51977668497", leadBase, "Yazmin", "PIURA", "Lead con ansiedad y problemas de sueño"));

console.log("\n\n" + "═".repeat(60));
console.log("  ESCENARIO 2 — LISTO_PARA_COORDINAR / CERRADO (Piura, ya existía)");
console.log("═".repeat(60) + "\n");
console.log(construirListoParaCoordinar("51977668497", leadCerrado, "Yazmin", "PIURA", "Lead con ansiedad y problemas de sueño"));

console.log("\n\n" + "═".repeat(60));
console.log("  ESCENARIO 3 — NO_CERRADO (Lima, NUEVO)");
console.log("═".repeat(60) + "\n");
console.log(construirNoCerrado("51987654321", leadNoCerrado, "Ayvi", "LIMA", "Hijo busca terapia para su mamá viuda — llegó a la oferta y se quedó callado"));

console.log("\n" + "═".repeat(60));
