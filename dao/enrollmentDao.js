import { runner } from "./runner.js";

export const EnrollmentDao = {
   async findByUser(id_user, { soloInscrito = false } = {}) {
      const r = await runner()(
         `SELECT e.id_enrollment, e.estatus, e.created_at AS fecha_inscripcion,
                 c.id_course, c.titulo, c.descripcion, c.numero_sesion, c.fecha_inicio, c.duracion_min,
                 CASE WHEN c.activo AND e.estatus = 'INSCRITO' THEN c.url_sesion END AS url_sesion, c.activo
            FROM enrollments e JOIN courses c ON c.id_course = e.id_course
           WHERE e.id_user = $1 ${soloInscrito ? "AND e.estatus = 'INSCRITO' AND c.activo" : ""}
           ORDER BY c.numero_sesion NULLS LAST, c.fecha_inicio NULLS LAST`,
         [id_user],
      );
      return r.rows;
   },

   async findByCourse(id_course) {
      const r = await runner()(
         `SELECT e.id_enrollment, e.estatus, e.created_at AS fecha_inscripcion,
                 u.id_user, u.email, u.activo, p.nombre_completo, p.empresa, p.puesto
            FROM enrollments e JOIN users u ON u.id_user = e.id_user LEFT JOIN profiles p ON p.id_user = u.id_user
           WHERE e.id_course = $1
           ORDER BY e.estatus, p.nombre_completo`,
         [id_course],
      );
      return r.rows;
   },

   async contarInscritos(id_course, client) {
      const r = await runner(client)(
         `SELECT COUNT(*)::int AS n FROM enrollments WHERE id_course = $1 AND estatus = 'INSCRITO'`,
         [id_course],
      );
      return r.rows[0].n;
   },

   async findOne(id_user, id_course, client) {
      const r = await runner(client)(
         `SELECT id_enrollment, estatus FROM enrollments WHERE id_user = $1 AND id_course = $2`,
         [id_user, id_course],
      );
      return r.rows[0] || null;
   },

   async upsertInscrito({ id_user, id_course, id_admin }, client) {
      await runner(client)(
         `INSERT INTO enrollments (id_user, id_course, id_admin_asigna) VALUES ($1, $2, $3)
          ON CONFLICT (id_user, id_course)
          DO UPDATE SET estatus = 'INSCRITO', id_admin_asigna = EXCLUDED.id_admin_asigna, updated_at = NOW()`,
         [id_user, id_course, id_admin],
      );
   },

   async setEstatus(id_user, id_course, estatus, client) {
      const r = await runner(client)(
         `UPDATE enrollments SET estatus = $3, updated_at = NOW() WHERE id_user = $1 AND id_course = $2
          RETURNING id_enrollment`,
         [id_user, id_course, estatus],
      );
      return r.rowCount > 0;
   },
};
