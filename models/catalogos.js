import { query } from "../db/index.js";

export async function initCatalogos() {
   await query(`
      INSERT INTO roles (clave, nombre) VALUES ('ADMIN', 'Administrador'), ('PARTICIPANTE', 'Participante')
      ON CONFLICT (clave) DO NOTHING;
   `);
   console.log("\x1b[32m", "Catálogos listos", "\x1b[0m");
}

if (import.meta.url === `file://${process.argv[1]}`) {
   initCatalogos()
      .then(() => process.exit(0))
      .catch((error) => {
         console.error("\x1b[31m", "Error:", error.cause?.message || error.message, "\x1b[0m");
         process.exit(1);
      });
}
