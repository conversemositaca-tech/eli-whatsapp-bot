/**
 * Borra TODO el historial de un telefono en Supabase:
 *  - chats_conversemos.*  con user_id = telefono
 *  - leads_conversemos.*  con id_usuario = telefono
 *
 * Uso: node scripts/eliminar-conversacion.js 51904301391
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");

const telefono = process.argv[2];
if (!telefono) {
  console.error("Uso: node scripts/eliminar-conversacion.js <telefono>");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

async function main() {
  console.log(`\nBorrando todo para ${telefono}...\n`);

  const { data: chats, error: errCount } = await supabase
    .from("chats_conversemos")
    .select("id")
    .eq("user_id", telefono);
  if (errCount) { console.error("err count chats:", errCount.message); process.exit(1); }
  console.log(`  chats_conversemos: ${chats.length} filas para borrar`);

  const { data: lead, error: errLead } = await supabase
    .from("leads_conversemos")
    .select("id_lead, paso_followup, precalificacion")
    .eq("id_usuario", telefono)
    .maybeSingle();
  if (errLead) { console.error("err lead:", errLead.message); process.exit(1); }
  if (lead) {
    console.log(`  leads_conversemos: 1 fila (paso_followup=${lead.paso_followup}, ${lead.precalificacion})`);
  } else {
    console.log(`  leads_conversemos: (no existe)`);
  }

  console.log("");

  const { error: errDelChats } = await supabase
    .from("chats_conversemos")
    .delete()
    .eq("user_id", telefono);
  if (errDelChats) { console.error("err delete chats:", errDelChats.message); process.exit(1); }
  console.log(`  ✓ chats_conversemos borrados`);

  if (lead) {
    const { error: errDelLead } = await supabase
      .from("leads_conversemos")
      .delete()
      .eq("id_usuario", telefono);
    if (errDelLead) { console.error("err delete lead:", errDelLead.message); process.exit(1); }
    console.log(`  ✓ leads_conversemos borrado`);
  }

  console.log(`\nListo. ${telefono} es ahora un primer contacto.\n`);
}

main().catch((e) => { console.error("[FATAL]", e.message); process.exit(1); });
