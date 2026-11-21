import { query } from "../db/index.js";

// Puestos y canales del formulario público; si cambian, actualizar también utils/catalogos.js.
async function verificarBaseSinInstalar() {
   if (process.argv.includes("--force")) return;
   const { rows } = await query(`SELECT to_regclass('public.users') IS NOT NULL AS existe`);
   if (!rows[0].existe) return;
   const datos = await query(`SELECT 1 FROM users LIMIT 1`);
   if (datos.rowCount > 0) {
      throw new Error(
         `La base ${process.env.PG_DATABASE}@${process.env.PG_HOST} ya está instalada. ` +
            `init-tables BORRA todas sus tablas; para forzarlo: node models/tables.js --force`,
      );
   }
}

export async function initTables() {
   await verificarBaseSinInstalar();

   await query(`CREATE EXTENSION IF NOT EXISTS unaccent;`);
   await query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
      $$ LANGUAGE plpgsql;
   `);

   await query(`
      DROP TABLE IF EXISTS password_reset_tokens, enrollments, courses, profiles, users, roles CASCADE;
   `);

   // ===== TABLA ROLES =====
   await query(`
      CREATE TABLE roles (
         id_rol SERIAL PRIMARY KEY,
         clave VARCHAR(30) NOT NULL UNIQUE,
         nombre VARCHAR(80) NOT NULL,
         activo BOOLEAN DEFAULT TRUE,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
   `);

   // ===== TABLA USERS =====
   // password_hash es NULL hasta que el participante activa su cuenta con el link del correo.
   // token_version invalida las sesiones emitidas antes de un cambio de contraseña o desactivación.
   await query(`
      CREATE TABLE users (
         id_user SERIAL PRIMARY KEY,
         email VARCHAR(160) NOT NULL,
         password_hash VARCHAR(100),
         id_rol INTEGER NOT NULL REFERENCES roles(id_rol) ON DELETE RESTRICT,
         activo BOOLEAN NOT NULL DEFAULT TRUE,
         email_verificado_at TIMESTAMP,
         token_version INTEGER NOT NULL DEFAULT 0,
         last_login_at TIMESTAMP,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT users_email_formato CHECK (email = lower(email) AND position('@' in email) > 1)
      );
      CREATE UNIQUE INDEX ux_users_email ON users(email);
      CREATE INDEX idx_users_rol ON users(id_rol);
      CREATE INDEX idx_users_activo ON users(activo);
   `);

   // ===== TABLA PROFILES =====
   await query(`
      CREATE TABLE profiles (
         id_profile SERIAL PRIMARY KEY,
         id_user INTEGER NOT NULL UNIQUE REFERENCES users(id_user) ON DELETE CASCADE,
         nombre_completo VARCHAR(150) NOT NULL,
         empresa VARCHAR(150),
         puesto VARCHAR(20)
            CHECK (puesto IN ('preventa','comercial','arquitecto','alianzas','consultor','directivo')),
         canal_invitacion VARCHAR(20) CHECK (canal_invitacion IN ('direct','distribuidor')),
         contacto_referido VARCHAR(150),
         telefono VARCHAR(30),
         pais VARCHAR(80),
         acepta_compromiso BOOLEAN NOT NULL DEFAULT FALSE,
         idioma VARCHAR(2) NOT NULL DEFAULT 'es' CHECK (idioma IN ('es','en')),
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_profiles_empresa ON profiles(lower(empresa));
      CREATE INDEX idx_profiles_puesto ON profiles(puesto);
      CREATE INDEX idx_profiles_canal ON profiles(canal_invitacion);
   `);

   // ===== TABLA COURSES =====
   await query(`
      CREATE TABLE courses (
         id_course SERIAL PRIMARY KEY,
         titulo VARCHAR(200) NOT NULL,
         descripcion TEXT,
         numero_sesion INTEGER CHECK (numero_sesion > 0),
         fecha_inicio TIMESTAMP,
         duracion_min INTEGER NOT NULL DEFAULT 60 CHECK (duracion_min > 0),
         url_sesion VARCHAR(500),
         cupo INTEGER CHECK (cupo IS NULL OR cupo > 0),
         activo BOOLEAN NOT NULL DEFAULT TRUE,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_courses_activo ON courses(activo);
      CREATE INDEX idx_courses_fecha ON courses(fecha_inicio);
   `);

   // ===== TABLA ENROLLMENTS =====
   await query(`
      CREATE TABLE enrollments (
         id_enrollment SERIAL PRIMARY KEY,
         id_user INTEGER NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
         id_course INTEGER NOT NULL REFERENCES courses(id_course) ON DELETE CASCADE,
         estatus VARCHAR(15) NOT NULL DEFAULT 'INSCRITO' CHECK (estatus IN ('INSCRITO','CANCELADO')),
         id_admin_asigna INTEGER REFERENCES users(id_user) ON DELETE SET NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT ux_enrollments_user_course UNIQUE (id_user, id_course)
      );
      CREATE INDEX idx_enrollments_course ON enrollments(id_course, estatus);
   `);

   // ===== TABLA PASSWORD_RESET_TOKENS =====
   // Sólo se guarda el SHA-256 del token: una fuga de la BD no permite usar los links.
   await query(`
      CREATE TABLE password_reset_tokens (
         id_token SERIAL PRIMARY KEY,
         id_user INTEGER NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
         token_hash CHAR(64) NOT NULL UNIQUE,
         tipo VARCHAR(15) NOT NULL CHECK (tipo IN ('ACTIVACION','RECUPERACION')),
         expires_at TIMESTAMP NOT NULL,
         used_at TIMESTAMP,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_prt_user ON password_reset_tokens(id_user);
   `);

   for (const tabla of ["roles", "users", "profiles", "courses", "enrollments", "password_reset_tokens"]) {
      await query(`
         DROP TRIGGER IF EXISTS update_${tabla}_updated_at ON ${tabla};
         CREATE TRIGGER update_${tabla}_updated_at BEFORE UPDATE ON ${tabla}
           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);
   }
   console.log("\x1b[32m", "Tablas creadas", "\x1b[0m");
}

if (import.meta.url === `file://${process.argv[1]}`) {
   initTables()
      .then(() => process.exit(0))
      .catch((error) => {
         console.error("\x1b[31m", "Error:", error.cause?.message || error.message, "\x1b[0m");
         process.exit(1);
      });
}
