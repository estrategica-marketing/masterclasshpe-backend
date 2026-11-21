import { query } from "../db/index.js";

// Vacía datos transaccionales y conserva catálogos/configuración.
// Uso: node models/limpiar.js [grupo...] --ejecutar --confirmar=<PG_DATABASE>@<PG_HOST>
const GRUPOS = {
   inscripciones: ["enrollments"],
   tokens: ["password_reset_tokens"],
   clases: ["courses"],
   participantes: ["profiles", "users"],
};
const CONSERVAR = ["roles"];

async function Limpiar() {
   if (process.env.NODE_ENV === "production") throw new Error("clean-data no se ejecuta en producción");
   const destino = `${process.env.PG_DATABASE}@${process.env.PG_HOST}`;
   const args = process.argv.slice(2);
   const ejecutar = args.includes("--ejecutar");
   const confirmar = args.find((a) => a.startsWith("--confirmar="))?.split("=")[1];
   const pedidos = args.filter((a) => !a.startsWith("--"));
   const elegidos = new Set(pedidos.length ? pedidos : Object.keys(GRUPOS));
   for (const g of elegidos) if (!GRUPOS[g]) throw new Error(`Grupo desconocido: ${g}`);

   const grupoDe = Object.fromEntries(Object.entries(GRUPOS).flatMap(([g, ts]) => ts.map((t) => [t, g])));
   const { rows: fks } = await query(`
      SELECT DISTINCT conrelid::regclass::text AS hija, confrelid::regclass::text AS padre
      FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`);

   // Si una tabla de otro grupo apunta a una elegida, su grupo también se vacía (TRUNCATE sin CASCADE).
   let cambio = true;
   while (cambio) {
      cambio = false;
      for (const { hija, padre } of fks) {
         if (!elegidos.has(grupoDe[padre])) continue;
         if (CONSERVAR.includes(hija)) continue;
         if (!grupoDe[hija]) throw new Error(`La tabla ${hija} no está clasificada en limpiar.js`);
         if (!elegidos.has(grupoDe[hija])) {
            elegidos.add(grupoDe[hija]);
            cambio = true;
         }
      }
   }

   const tablas = [...elegidos].flatMap((g) => GRUPOS[g]);
   console.log("\x1b[33m", `Destino: ${destino}`, "\x1b[0m");
   for (const t of tablas) {
      const { rows } = await query(`SELECT COUNT(*)::int AS n FROM ${t}`);
      console.log(`  ${t}: ${rows[0].n} filas`);
   }
   if (!ejecutar) return console.log("\x1b[33m", "Simulación. Agrega --ejecutar --confirmar=" + destino, "\x1b[0m");
   if (confirmar !== destino) throw new Error(`--confirmar debe ser exactamente ${destino}`);
   await query(`TRUNCATE ${tablas.join(", ")} RESTART IDENTITY`);
   console.log("\x1b[32m", "Datos eliminados. Corre npm run init-seeds para recrear el admin.", "\x1b[0m");
}

Limpiar()
   .then(() => process.exit(0))
   .catch((error) => {
      console.error("\x1b[31m", "Error:", error.cause?.message || error.message, "\x1b[0m");
      process.exit(1);
   });
