import { runner } from "./runner.js";

// Campos públicos: nunca incluye password_hash.
const USER_FIELDS = `u.id_user, u.email, u.activo, u.email_verificado_at, u.last_login_at, u.created_at,
   r.clave AS rol, p.nombre_completo, p.empresa, p.puesto, p.canal_invitacion, p.contacto_referido,
   p.telefono, p.pais, p.acepta_compromiso, p.idioma`;
const USER_JOINS = `FROM users u JOIN roles r ON r.id_rol = u.id_rol LEFT JOIN profiles p ON p.id_user = u.id_user`;

export const UserDao = {
   async findById(id, client) {
      const r = await runner(client)(`SELECT ${USER_FIELDS} ${USER_JOINS} WHERE u.id_user = $1`, [id]);
      return r.rows[0] || null;
   },

   // Sólo para autenticación: incluye hash y token_version.
   async findAuthByEmail(email, client) {
      const r = await runner(client)(
         `SELECT u.id_user, u.email, u.password_hash, u.activo, u.token_version, u.email_verificado_at,
                 r.clave AS rol, p.nombre_completo, p.idioma
            ${USER_JOINS} WHERE u.email = $1`,
         [email],
      );
      return r.rows[0] || null;
   },

   async findAuthById(id, client) {
      const r = await runner(client)(
         `SELECT u.id_user, u.email, u.password_hash, u.activo, u.token_version, r.clave AS rol
            FROM users u JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_user = $1${client ? " FOR UPDATE OF u" : ""}`,
         [id],
      );
      return r.rows[0] || null;
   },

   async createUser({ email, rolClave = "PARTICIPANTE" }, client) {
      const r = await runner(client)(
         `INSERT INTO users (email, id_rol) VALUES ($1, (SELECT id_rol FROM roles WHERE clave = $2)) RETURNING id_user`,
         [email, rolClave],
      );
      return r.rows[0].id_user;
   },

   async createProfile(id_user, d, client) {
      await runner(client)(
         `INSERT INTO profiles (id_user, nombre_completo, empresa, puesto, canal_invitacion, contacto_referido,
                                telefono, pais, acepta_compromiso, idioma)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
         [
            id_user,
            d.nombre_completo,
            d.empresa ?? null,
            d.puesto ?? null,
            d.canal_invitacion ?? null,
            d.contacto_referido ?? null,
            d.telefono ?? null,
            d.pais ?? null,
            d.acepta_compromiso ?? false,
            d.idioma ?? "es",
         ],
      );
   },

   // Update parcial: undefined no toca la columna; null la vacía (sólo en columnas opcionales).
   async updateProfile(id_user, d, client) {
      const columnas = [
         "nombre_completo",
         "empresa",
         "puesto",
         "canal_invitacion",
         "contacto_referido",
         "telefono",
         "pais",
         "idioma",
      ];
      const sets = [];
      const params = [id_user];
      for (const c of columnas) {
         if (d[c] === undefined) continue;
         params.push(d[c]);
         sets.push(`${c} = $${params.length}`);
      }
      if (sets.length) {
         await runner(client)(`UPDATE profiles SET ${sets.join(", ")}, updated_at = NOW() WHERE id_user = $1`, params);
      }
   },

   async updateEmail(id_user, email, client) {
      await runner(client)(`UPDATE users SET email = $2, updated_at = NOW() WHERE id_user = $1`, [id_user, email]);
   },

   async setPassword(id_user, hash, client) {
      await runner(client)(
         `UPDATE users SET password_hash = $2, token_version = token_version + 1,
                 email_verificado_at = COALESCE(email_verificado_at, NOW()), updated_at = NOW()
           WHERE id_user = $1`,
         [id_user, hash],
      );
   },

   async setActivo(id_user, activo, client) {
      const r = await runner(client)(
         `UPDATE users SET activo = $2, token_version = token_version + CASE WHEN $2 THEN 0 ELSE 1 END,
                 updated_at = NOW()
           WHERE id_user = $1 RETURNING id_user`,
         [id_user, activo],
      );
      return r.rowCount > 0;
   },

   async touchLogin(id_user) {
      await runner()(`UPDATE users SET last_login_at = NOW() WHERE id_user = $1`, [id_user]);
   },

   // Búsqueda de participantes con filtros y paginación. Los valores van siempre como parámetros.
   async searchParticipantes(f = {}, { limit, offset } = {}) {
      const conditions = ["r.clave = 'PARTICIPANTE'"];
      const params = [];
      const add = (valor, sql) => {
         params.push(valor);
         conditions.push(sql.replaceAll("$?", `$${params.length}`));
      };
      if (f.q) {
         add(
            `%${f.q}%`,
            `(unaccent(p.nombre_completo) ILIKE unaccent($?) OR u.email ILIKE $? OR unaccent(p.empresa) ILIKE unaccent($?))`,
         );
      }
      if (f.empresa) add(`%${f.empresa}%`, `unaccent(p.empresa) ILIKE unaccent($?)`);
      if (f.puesto) add(f.puesto, `p.puesto = $?`);
      if (f.canal) add(f.canal, `p.canal_invitacion = $?`);
      if (f.activo !== undefined) add(f.activo, `u.activo = $?`);
      if (f.verificado !== undefined) {
         conditions.push(f.verificado ? "u.email_verificado_at IS NOT NULL" : "u.email_verificado_at IS NULL");
      }
      if (f.id_course) {
         add(
            f.id_course,
            `EXISTS (SELECT 1 FROM enrollments e WHERE e.id_user = u.id_user AND e.id_course = $? AND e.estatus = 'INSCRITO')`,
         );
      }
      const where = `WHERE ${conditions.join(" AND ")}`;
      let paginacion = "";
      if (limit) {
         params.push(limit, offset ?? 0);
         paginacion = `LIMIT $${params.length - 1} OFFSET $${params.length}`;
      }
      const r = await runner()(
         `SELECT ${USER_FIELDS},
                 (SELECT COUNT(*)::int FROM enrollments e WHERE e.id_user = u.id_user AND e.estatus = 'INSCRITO') AS total_clases,
                 (SELECT string_agg(c.titulo, ' | ' ORDER BY c.numero_sesion NULLS LAST, c.id_course)
                    FROM enrollments e JOIN courses c ON c.id_course = e.id_course
                   WHERE e.id_user = u.id_user AND e.estatus = 'INSCRITO') AS clases,
                 COUNT(*) OVER()::int AS total_registros
            ${USER_JOINS} ${where}
           ORDER BY u.created_at DESC, u.id_user DESC ${paginacion}`,
         params,
      );
      return r.rows;
   },

   async resumen() {
      const r = await runner()(`
         SELECT COUNT(*)::int AS participantes,
                COUNT(*) FILTER (WHERE u.email_verificado_at IS NOT NULL)::int AS verificados,
                COUNT(*) FILTER (WHERE u.created_at >= NOW() - INTERVAL '7 days')::int AS nuevos_7d,
                (SELECT COUNT(*)::int FROM courses WHERE activo) AS clases_activas,
                (SELECT COUNT(*)::int FROM enrollments WHERE estatus = 'INSCRITO') AS inscripciones
           FROM users u JOIN roles r ON r.id_rol = u.id_rol WHERE r.clave = 'PARTICIPANTE'`);
      return r.rows[0];
   },
};
