/**
 * Lee chats_conversemos + leads_conversemos para un teléfono dado
 * y muestra el historial tal cual lo recibe GPT-4o en cada turno.
 *
 * Uso: node scripts/inspeccionar-conversacion.js 51997510881
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");

const telefono = process.argv[2];
if (!telefono) {
  console.error("Uso: node scripts/inspeccionar-conversacion.js <telefono>");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

function preview(s, n = 240) {
  if (s == null) return "(null)";
  const flat = String(s).replace(/\s+/g, " ");
  return flat.length > n ? flat.slice(0, n) + "…" : flat;
}

async function main() {
  console.log(`── LEAD (${telefono}) ──`);
  const { data: lead, error: errL } = await supabase
    .from("leads_conversemos")
    .select("*")
    .eq("id_usuario", telefono)
    .maybeSingle();
  if (errL) { console.error("err lead:", errL.message); }
  else if (!lead) { console.log("(no hay lead para este telefono)"); }
  else {
    const interesantes = [
      "id_lead", "para_quien", "edad", "sede", "motivo",
      "nombre_cliente", "paciente", "dni_contacto", "dni_paciente",
      "psicologo_asignado", "precalificacion", "paso_followup",
      "fecha", "fecha_actualizacion", "resumen",
    ];
    for (const k of interesantes) {
      console.log(`  ${k.padEnd(20)} ${preview(lead[k])}`);
    }
  }

  console.log(`\n── CHATS (${telefono}) ──`);
  const { data: chats, error: errC } = await supabase
    .from("chats_conversemos")
    .select("id, date_time, message_content, assistant_response")
    .eq("user_id", telefono)
    .order("date_time", { ascending: true });
  if (errC) { console.error("err chats:", errC.message); return; }

  console.log(`Total filas: ${chats?.length || 0}\n`);

  let i = 0;
  for (const row of chats || []) {
    i++;
    console.log(`#${i} [${row.date_time}] (id=${row.id})`);
    console.log(`  USER: ${preview(row.message_content, 320)}`);
    let assistantText = row.assistant_response;
    try {
      const parsed = JSON.parse(row.assistant_response);
      if (parsed?.respuesta) assistantText = parsed.respuesta;
    } catch { /* no era JSON */ }
    console.log(`  ELI : ${preview(assistantText, 320)}`);
    console.log("");
  }
}

main().catch((e) => { console.error("[FATAL]", e.message); process.exit(1); });
