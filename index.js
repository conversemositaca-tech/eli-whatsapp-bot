require("dotenv").config();
const app = require("./src/app");

const PORT = process.env.PORT || 3000;

// Validar variables de entorno críticas al arrancar
const REQUIRED_ENV = [
  "OPENAI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE",
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error("[STARTUP] Faltan variables de entorno:", missing.join(", "));
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`[STARTUP] Eli WhatsApp Bot corriendo en http://localhost:${PORT}`);
  console.log(`[STARTUP] Webhook disponible en POST http://localhost:${PORT}/webhook`);
});
