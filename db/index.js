import dotenv from "dotenv";
import pkg from "pg";

if (process.env.NODE_ENV !== "production") dotenv.config({ quiet: true });

const { Pool, types } = pkg;

// TIMESTAMP sin zona = hora del negocio. Se devuelve como texto "YYYY-MM-DD HH:mm:ss" para que
// ni Node ni el navegador la conviertan a otra zona.
types.setTypeParser(1114, (valor) => valor.slice(0, 19));

// PG_SSL=true/false explícito (los Postgres internos de Docker suelen no soportar SSL);
// sin PG_SSL, SSL sólo en producción.
const usarSSL =
   process.env.PG_SSL !== undefined ? process.env.PG_SSL === "true" : process.env.NODE_ENV === "production";

const pool = new Pool({
   host: process.env.PG_HOST,
   port: Number(process.env.PG_PORT),
   user: process.env.PG_USER,
   password: process.env.PG_PASSWORD,
   database: process.env.PG_DATABASE,
   ssl: usarSSL ? { rejectUnauthorized: false } : false,
   // NOW()/CURRENT_TIMESTAMP en columnas TIMESTAMP guardan la hora local de la sesión:
   // se fija la hora del negocio para no depender de la zona del servidor de BD (suele ser UTC).
   options: `-c timezone=${process.env.TZ || "America/Mexico_City"}`,
});

export const query = async (text, params) => {
   try {
      return await pool.query(text, params);
   } catch (error) {
      console.error("\x1b[31m", "Error de base de datos ===>", error.message, "\x1b[0m");
      throw new Error("Error en la consulta a la base de datos", { cause: error });
   }
};

// Dentro de la transacción se usa client.query directo: conserva el .code de Postgres.
export const withTransaction = async (fn) => {
   const client = await pool.connect();
   try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
   } catch (error) {
      try {
         await client.query("ROLLBACK");
      } catch (e) {
         console.error("\x1b[31m", "Error al hacer ROLLBACK ===>", e.message, "\x1b[0m");
      }
      throw error;
   } finally {
      client.release();
   }
};

export const isUniqueViolation = (error) => error?.code === "23505" || error?.cause?.code === "23505";

export { pool };
