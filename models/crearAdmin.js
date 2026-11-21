import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { withTransaction } from "../db/index.js";
import { esEmail, normalizarEmail, validarPassword } from "../utils/validar.js";

// Alta manual de administradores (consultan y exportan los registros de la landing).
// No hay alta desde el panel a propósito: sólo quien tiene acceso al servidor o a la BD crea admins.
// Uso: npm run crear-admin -- <correo> "<Nombre completo>" [--password <clave>] [--reset]
// Alternativa directa en SQL: docs/administradores.md

const AYUDA = `Uso: npm run crear-admin -- <correo> "<Nombre completo>" [--password <clave>] [--reset]
  --password  contraseña inicial (10–72 caracteres, letras y números). Si se omite, se genera una temporal.
  --reset     si el admin ya existe: cambia su contraseña, lo reactiva y cierra sus sesiones.`;

const leerArgs = (argv) => {
   const args = { posicionales: [], reset: false, password: undefined };
   for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--reset") args.reset = true;
      else if (argv[i] === "--password") args.password = argv[++i];
      else if (argv[i] === "--help" || argv[i] === "-h") args.ayuda = true;
      else args.posicionales.push(argv[i]);
   }
   return args;
};

// Temporal con letras y números garantizados (validarPassword exige ambos).
const generarPassword = () => {
   for (;;) {
      const p = crypto.randomBytes(12).toString("base64url");
      if (/[A-Za-z]/.test(p) && /\d/.test(p)) return p;
   }
};

export async function crearAdmin({ email, nombre, password, reset = false }) {
   email = normalizarEmail(email);
   if (!esEmail(email)) throw new Error(`Correo inválido: "${email}" (debe incluir dominio, p. ej. nombre@empresa.com)`);
   nombre = typeof nombre === "string" ? nombre.trim() : "";
   if (!nombre || nombre.length > 150) throw new Error("Nombre completo obligatorio (máximo 150 caracteres)");
   const generada = password === undefined;
   const clave = generada ? generarPassword() : password;
   try {
      validarPassword(clave);
   } catch (e) {
      throw new Error(e.detalle || e.message);
   }
   const hash = await bcrypt.hash(clave, 12);

   const accion = await withTransaction(async (client) => {
      const { rows } = await client.query(
         `SELECT u.id_user, r.clave AS rol FROM users u JOIN roles r ON r.id_rol = u.id_rol WHERE u.email = $1 FOR UPDATE OF u`,
         [email],
      );
      const existente = rows[0];
      if (existente) {
         // Una cuenta de la landing nunca se convierte en admin desde aquí: evita escalar privilegios por error.
         if (existente.rol !== "ADMIN") throw new Error(`${email} ya existe como ${existente.rol}; no se modifica`);
         if (!reset) throw new Error(`El admin ${email} ya existe. Usa --reset para cambiar su contraseña`);
         // token_version + 1: cualquier sesión abierta con la contraseña anterior deja de valer.
         await client.query(
            `UPDATE users SET password_hash = $2, activo = TRUE, token_version = token_version + 1,
                    email_verificado_at = COALESCE(email_verificado_at, NOW())
              WHERE id_user = $1`,
            [existente.id_user, hash],
         );
         await client.query(`UPDATE profiles SET nombre_completo = $2 WHERE id_user = $1`, [existente.id_user, nombre]);
         return "actualizado";
      }
      const r = await client.query(
         `INSERT INTO users (email, password_hash, id_rol, email_verificado_at)
          VALUES ($1, $2, (SELECT id_rol FROM roles WHERE clave = 'ADMIN'), NOW()) RETURNING id_user`,
         [email, hash],
      );
      await client.query(`INSERT INTO profiles (id_user, nombre_completo, empresa) VALUES ($1, $2, 'HPE')`, [
         r.rows[0].id_user,
         nombre,
      ]);
      return "creado";
   });
   return { email, accion, password: generada ? clave : null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
   const args = leerArgs(process.argv.slice(2));
   if (args.ayuda || args.posicionales.length !== 2) {
      console.log(AYUDA);
      process.exit(args.ayuda ? 0 : 1);
   }
   const [email, nombre] = args.posicionales;
   crearAdmin({ email, nombre, password: args.password, reset: args.reset })
      .then(({ email, accion, password }) => {
         console.log("\x1b[32m", `Administrador ${accion}: ${email}`, "\x1b[0m");
         if (password) {
            console.log("\x1b[33m", `Contraseña temporal (se muestra sólo esta vez): ${password}`, "\x1b[0m");
         }
         process.exit(0);
      })
      .catch((error) => {
         console.error("\x1b[31m", "Error:", error.cause?.message || error.message, "\x1b[0m");
         process.exit(1);
      });
}
