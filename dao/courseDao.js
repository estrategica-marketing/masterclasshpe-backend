import { runner } from "./runner.js";

const COURSE_FIELDS = `c.id_course, c.titulo, c.descripcion, c.numero_sesion, c.fecha_inicio, c.duracion_min,
   c.url_sesion, c.cupo, c.activo, c.created_at, c.updated_at`;
const INSCRITOS = `(SELECT COUNT(*)::int FROM enrollments e WHERE e.id_course = c.id_course AND e.estatus = 'INSCRITO')`;

export const CourseDao = {
   async findAll({ onlyActive = false } = {}) {
      const where = onlyActive ? "WHERE c.activo = TRUE" : "";
      const r = await runner()(
         `SELECT ${COURSE_FIELDS}, ${INSCRITOS} AS inscritos FROM courses c ${where}
           ORDER BY c.numero_sesion NULLS LAST, c.fecha_inicio NULLS LAST, c.id_course`,
      );
      return r.rows;
   },

   async findById(id, client) {
      const r = await runner(client)(
         `SELECT ${COURSE_FIELDS}, ${INSCRITOS} AS inscritos FROM courses c WHERE c.id_course = $1`,
         [id],
      );
      return r.rows[0] || null;
   },

   // Bloquea la fila del curso: serializa inscripciones concurrentes para respetar el cupo.
   async lockById(id, client) {
      const r = await runner(client)(`SELECT id_course, cupo, activo FROM courses WHERE id_course = $1 FOR UPDATE`, [id]);
      return r.rows[0] || null;
   },

   async create(d) {
      const r = await runner()(
         `INSERT INTO courses (titulo, descripcion, numero_sesion, fecha_inicio, duracion_min, url_sesion, cupo, activo)
          VALUES ($1, $2, $3, $4, COALESCE($5, 60), $6, $7, COALESCE($8, TRUE)) RETURNING id_course`,
         [d.titulo, d.descripcion, d.numero_sesion, d.fecha_inicio, d.duracion_min, d.url_sesion, d.cupo, d.activo],
      );
      return r.rows[0].id_course;
   },

   async update(id, d) {
      const columnas = ["titulo", "descripcion", "numero_sesion", "fecha_inicio", "duracion_min", "url_sesion", "cupo"];
      const sets = [];
      const params = [id];
      for (const c of columnas) {
         if (d[c] === undefined) continue;
         params.push(d[c]);
         sets.push(`${c} = $${params.length}`);
      }
      if (!sets.length) return (await this.findById(id)) ? id : null;
      const r = await runner()(
         `UPDATE courses SET ${sets.join(", ")}, updated_at = NOW() WHERE id_course = $1 RETURNING id_course`,
         params,
      );
      return r.rows[0]?.id_course ?? null;
   },

   async setActivo(id, activo) {
      const r = await runner()(
         `UPDATE courses SET activo = $2, updated_at = NOW() WHERE id_course = $1 RETURNING id_course`,
         [id, activo],
      );
      return r.rows[0]?.id_course ?? null;
   },
};
