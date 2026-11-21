import bcrypt from "bcrypt";
import { query } from "../db/index.js";

// Sesiones 2027: mismos títulos y fechas que el programa de la landing
// (masterclasshpe-frontend/src/i18n/landing.ts, s1-title…s6-title / s1-date…s6-date). Si cambia uno, cambiar el otro.
// Sólo fuera de producción; en producción las clases las da de alta el administrador.
// La hora 10:00 no está confirmada por HPE.
const SESIONES = [
   ["Virtualización: tendencias y oportunidades de negocio", 1],
   ["Nube empresarial y datos: decisiones de modernización", 2],
   ["Estrategia de canales: del producto al valor consultivo", 3],
   ["Visión ejecutiva para decisiones de infraestructura", 4],
   ["Servicios de datos y arquitectura resiliente", 5],
   ["Liderazgo comercial para oportunidades complejas", 6],
];

export async function initSeeds() {
   const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE = "Administrador" } = process.env;
   if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Faltan ADMIN_EMAIL / ADMIN_PASSWORD en el entorno");
   if (ADMIN_PASSWORD.length < 10) throw new Error("ADMIN_PASSWORD debe tener al menos 10 caracteres");

   const email = ADMIN_EMAIL.trim().toLowerCase();
   const existe = await query(`SELECT id_user FROM users WHERE email = $1`, [email]);
   if (existe.rowCount === 0) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      const { rows } = await query(
         `INSERT INTO users (email, password_hash, id_rol, email_verificado_at)
          VALUES ($1, $2, (SELECT id_rol FROM roles WHERE clave = 'ADMIN'), NOW()) RETURNING id_user`,
         [email, hash],
      );
      await query(`INSERT INTO profiles (id_user, nombre_completo, empresa) VALUES ($1, $2, 'HPE')`, [
         rows[0].id_user,
         ADMIN_NOMBRE,
      ]);
      console.log("\x1b[32m", `Administrador creado: ${email}`, "\x1b[0m");
   } else {
      console.log("\x1b[33m", `El administrador ${email} ya existe`, "\x1b[0m");
   }

   if (process.env.NODE_ENV !== "production") {
      const { rows } = await query(`SELECT COUNT(*)::int AS n FROM courses`);
      if (rows[0].n === 0) {
         for (const [titulo, n] of SESIONES) {
            await query(
               `INSERT INTO courses (titulo, numero_sesion, fecha_inicio, duracion_min)
                VALUES ($1, $2, DATE '2027-01-14' + ($2 - 1) * INTERVAL '14 days' + TIME '10:00', 60)`,
               [titulo, n],
            );
         }
         console.log("\x1b[32m", "Sesiones de prueba creadas", "\x1b[0m");
      }
   }
}

if (import.meta.url === `file://${process.argv[1]}`) {
   initSeeds()
      .then(() => process.exit(0))
      .catch((error) => {
         console.error("\x1b[31m", "Error:", error.cause?.message || error.message, "\x1b[0m");
         process.exit(1);
      });
}
