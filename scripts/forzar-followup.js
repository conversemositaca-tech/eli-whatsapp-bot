/**
 * Dispara MANUALMENTE el siguiente paso de followup para UN solo teléfono.
 * Sirve para validar end-to-end el sistema de recontacto sin esperar
 * los delays reales (15 días) ni afectar a otros leads.
 *
 * Uso:
 *   node scripts/forzar-followup.js 51904301391
 *   node scripts/forzar-followup.js 904301391            # le agrega 51 si falta
 *   node scripts/forzar-followup.js 51904301391 --reset  # vuelve al paso 1 (paso_followup=0)
 *
 * Comportamiento:
 *   1. Lee el lead. Si no existe, error.
 *   2. Si paso_followup >= 8 (terminado) o se pasó --reset, lo deja en paso 0.
 *   3. Manda el mensaje del paso correspondiente (texto o imagen+caption).
 *   4. Avanza paso_followup +1 en Supabase.
 *
 * Cada vez que lo corres, recibes el siguiente paso. Para volver a recibir
 * el paso 1 desde cero, agrega --reset.
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");
const { enviarMensaje, enviarImagenUrl } = require("../src/services/evolution");
const { actualizarPasoFollowup } = require("../src/services/supabase");
const { SECUENCIA, primerNombre } = require("../src/services/followup");

const arg = process.argv[2];
const reset = process.argv.includes("--reset");
if (!arg) {
  console.error("Uso: node scripts/forzar-followup.js <telefono> [--reset]");
  process.exit(1);
}
const telefono = arg.startsWith("51") ? arg : `51${arg}`;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

async function main() {
  const { data: lead, error } = await supabase
    .from("leads_conversemos")
    .select("id_lead, nombre_cliente, paso_followup")
    .eq("id_usuario", telefono)
    .maybeSingle();

  if (error) { console.error("ERROR Supabase:", error.message); process.exit(1); }
  if (!lead)  { console.error(`No existe lead para ${telefono} en leads_conversemos`); process.exit(1); }

  const pasoOriginal = lead.paso_followup ?? 0;
  const debeResetear = reset || pasoOriginal >= SECUENCIA.length;
  const paso = debeResetear ? 0 : pasoOriginal;

  const step  = SECUENCIA[paso];
  const nombre = primerNombre(lead.nombre_cliente);
  const numeroPaso = paso + 1;

  console.log(`\n→ Disparando paso ${numeroPaso}/${SECUENCIA.length} a ${telefono}`);
  if (debeResetear) console.log(`  (lead estaba en paso ${pasoOriginal}; el reset se aplica solo si el envío sale bien)`);
  console.log(`  Tipo: ${step.imagen ? "IMAGEN + caption" : "solo texto"}`);
  console.log(`  Texto: "${step.texto(nombre)}"`);
  if (step.imagen) console.log(`  URL imagen: ${step.imagen()}`);
  console.log("");

  // Enviar PRIMERO. Solo si sale OK, tocamos la BD.
  try {
    if (step.imagen) {
      await enviarImagenUrl(telefono, step.imagen(), step.texto(nombre));
    } else {
      await enviarMensaje(telefono, step.texto(nombre));
    }
    console.log(`✅ Mensaje enviado por WhatsApp.`);
  } catch (e) {
    console.error("ERROR enviando:", e.message);
    if (e.response) console.error("  detalle:", e.response.data);
    console.error("(BD intacta — no se modificó paso_followup)");
    process.exit(1);
  }

  // Envío OK → ahora sí persistir. actualizarPasoFollowup setea paso N+1 + actualiza fecha.
  await actualizarPasoFollowup(lead.id_lead, paso + 1);
  console.log(`✅ paso_followup avanzado a ${paso + 1} en Supabase.`);
  if (paso + 1 < SECUENCIA.length) {
    console.log(`\nPara el siguiente paso, vuelve a correr el script (sin --reset).`);
    console.log(`Para reiniciar desde el paso 1, corre con --reset.`);
  } else {
    console.log(`\n🎉 Recorriste los ${SECUENCIA.length} pasos. Lead quedó en paso ${SECUENCIA.length} (terminado).`);
  }
}

main().catch((e) => { console.error("[FATAL]", e.message); process.exit(1); });
