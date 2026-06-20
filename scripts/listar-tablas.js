// Lista las tablas que existen en el Base de Airtable configurado en .env.
// Útil cuando da NOT_FOUND y queremos saber el nombre exacto.
//
// Uso:  node scripts/listar-tablas.js

require("dotenv").config();
const axios = require("axios");

(async () => {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const pat = process.env.AIRTABLE_PAT;

  console.log(`\nBase ID: ${baseId}\n`);

  try {
    const r = await axios.get(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      { headers: { Authorization: `Bearer ${pat}` } }
    );

    console.log(`Tablas encontradas (${r.data.tables.length}):\n`);
    for (const t of r.data.tables) {
      console.log(`  📋 "${t.name}"  (id: ${t.id})`);
    }
    console.log("");
  } catch (err) {
    console.error("Error:", err.message);
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Detalle:", JSON.stringify(err.response.data, null, 2));
      if (err.response.status === 403) {
        console.error("\n⚠️  Tu PAT no tiene permiso 'schema.bases:read'.");
        console.error("    Ve a https://airtable.com/create/tokens y agrega ese scope al token.");
      }
    }
    process.exit(1);
  }
})();
