import app from "./app.js";
import { query } from "./db/index.js";

const PORT = process.env.PORT || 3000;

query("SELECT 1")
   .then(() => console.log("\x1b[32m", "Conexión a PostgreSQL OK", "\x1b[0m"))
   .catch(() => console.error("\x1b[31m", "No se pudo conectar a PostgreSQL", "\x1b[0m"));

app.listen(PORT, () => {
   console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
   console.log("NODE_ENV:", process.env.NODE_ENV, "| TZ:", process.env.TZ);
});
