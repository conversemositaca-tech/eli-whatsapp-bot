// Test funcional end-to-end del servicio supabase.js.
// Crea un lead de prueba con id_usuario="__TEST__", ejerce todas las funciones,
// y deja la base limpia al final. NO toca leads reales.
//
// Uso:  node scripts/test-supabase.js

require("dotenv").config();
const sb = require("../src/services/supabase");
const { createClient } = require("@supabase/supabase-js");

const TEL = "__TEST__";

function ok(label) { console.log(`  ✅ ${label}`); }
function info(label, val) { console.log(`     ${label}:`, val); }

(async () => {
  console.log("\n=== TEST supabase.js ===\n");

  console.log("1. crearLeadInicialSiNoExiste");
  await sb.crearLeadInicialSiNoExiste(TEL);
  ok("lead inicial creado");

  console.log("\n2. buscarMemoria (sin chats aún)");
  const m1 = await sb.buscarMemoria(TEL);
  if (m1 !== null) throw new Error(`Esperaba null, obtuve: ${JSON.stringify(m1)}`);
  ok("retorna null como se espera");

  console.log("\n3. crearMemoria — primer intercambio");
  await sb.crearMemoria(TEL, [
    { role: "user", content: "hola" },
    { role: "assistant", content: '{"respuesta":"Hola, soy Eli"}' },
  ]);
  ok("intercambio guardado");

  console.log("\n4. buscarMemoria (debería traer 1 par)");
  const m2 = await sb.buscarMemoria(TEL);
  if (!m2 || m2.history.length !== 2) throw new Error(`history mal: ${JSON.stringify(m2)}`);
  ok(`history tiene ${m2.history.length} mensajes`);
  info("recordId", m2.recordId);

  console.log("\n5. actualizarMemoria — segundo intercambio");
  await sb.actualizarMemoria(m2.recordId, [
    { role: "user", content: "hola" },
    { role: "assistant", content: '{"respuesta":"Hola, soy Eli"}' },
    { role: "user", content: "tengo ansiedad" },
    { role: "assistant", content: '{"respuesta":"Te leo con cariño"}' },
  ]);
  ok("segundo intercambio guardado");

  const m3 = await sb.buscarMemoria(TEL);
  if (m3.history.length !== 4) throw new Error(`Esperaba 4 mensajes, obtuve ${m3.history.length}`);
  ok(`history ahora tiene ${m3.history.length} mensajes`);

  console.log("\n6. registrarOActualizarLead");
  const r1 = await sb.registrarOActualizarLead(TEL, {
    nombre_contacto: "Andrea",
    edad_paciente: 27,
    ciudad: "Lima",
    motivo: "ansiedad",
    para_quien: "yo mismo",
    calificacion: "ALTO",
  });
  ok("lead actualizado");
  info("isNew", r1.isNew);
  info("dniNuevo", r1.dniNuevo);

  console.log("\n7. registrarOActualizarLead con DNI (dispara dniNuevo=true)");
  const r2 = await sb.registrarOActualizarLead(TEL, {
    nombre_contacto: "Andrea",
    motivo: "ansiedad",
    ciudad: "Lima",
    dni_contacto: "71234567",
    calificacion: "ALTO",
  });
  if (!r2.dniNuevo) throw new Error("Esperaba dniNuevo=true");
  ok(`dniNuevo=${r2.dniNuevo} (correcto, era la primera vez con DNI)`);

  console.log("\n8. obtenerLeadsEnFollowup (paso=8 después de DNI → no aparece)");
  const leads = await sb.obtenerLeadsEnFollowup();
  const apareceTest = leads.some((l) => l.fields.CELULAR === TEL);
  if (apareceTest) throw new Error("Lead con DNI no debería aparecer en followup (paso=8)");
  ok("lead con DNI omitido del followup como se espera");

  console.log("\n9. actualizarPasoFollowup (rebajamos a paso 2)");
  await sb.actualizarPasoFollowup(r2.recordId, 2);
  const leads2 = await sb.obtenerLeadsEnFollowup();
  const test2 = leads2.find((l) => l.fields.CELULAR === TEL);
  if (!test2) throw new Error("Lead de prueba no aparece tras volver a paso 2");
  if (test2.fields.PASO_FOLLOWUP !== 2) throw new Error(`paso_followup = ${test2.fields.PASO_FOLLOWUP}`);
  ok(`lead reaparece con PASO_FOLLOWUP=${test2.fields.PASO_FOLLOWUP}`);
  info("formato Airtable-like", JSON.stringify(test2));

  console.log("\n10. Limpieza — borrar lead y chats de prueba");
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: { persistSession: false },
  });
  await admin.from("chats_conversemos").delete().eq("user_id", TEL);
  await admin.from("leads_conversemos").delete().eq("id_usuario", TEL);
  ok("registros de prueba eliminados");

  console.log("\n=== ✅ TODOS LOS TESTS PASARON ===\n");
  process.exit(0);
})().catch((err) => {
  console.error("\n❌ TEST FALLÓ:", err.message);
  if (err.cause) console.error("   cause:", err.cause);
  process.exit(1);
});
