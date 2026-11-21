import { withTransaction } from "../db/index.js";
import { CourseDao } from "../dao/courseDao.js";
import { EnrollmentDao } from "../dao/enrollmentDao.js";
import { UserDao } from "../dao/userDao.js";
import { fallo } from "../utils/errores.js";
import { enteroPositivo, texto } from "../utils/validar.js";

const fecha = (valor) => {
   if (valor === undefined) return undefined;
   if (valor === null || valor === "") return null;
   // Se acepta "YYYY-MM-DDTHH:mm" (input datetime-local) en hora del negocio: columnas sin zona.
   if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(valor))
      fallo("VALIDACION", "Fecha de inicio inválida");
   if (Number.isNaN(new Date(valor).getTime())) fallo("VALIDACION", "Fecha de inicio inválida");
   return valor.replace("T", " ");
};

const url = (valor) => {
   const v = texto(valor, { campo: "URL de la sesión", max: 500 });
   if (v && !/^https:\/\/\S+$/i.test(v)) fallo("VALIDACION", "La URL de la sesión debe iniciar con https://");
   return v;
};

const validarCurso = (b, { crear }) => {
   const d = {
      titulo: texto(b.titulo, { campo: "Título", max: 200, requerido: crear }),
      descripcion: texto(b.descripcion, { campo: "Descripción", max: 5000 }),
      numero_sesion: enteroPositivo(b.numero_sesion, { campo: "Número de sesión" }),
      fecha_inicio: fecha(b.fecha_inicio),
      duracion_min: enteroPositivo(b.duracion_min, { campo: "Duración" }),
      url_sesion: url(b.url_sesion),
      cupo: enteroPositivo(b.cupo, { campo: "Cupo" }),
   };
   if (d.titulo === null) fallo("VALIDACION", "Título es obligatorio");
   if (d.duracion_min === null) d.duracion_min = undefined;
   if (b.activo !== undefined && typeof b.activo !== "boolean") fallo("VALIDACION", "activo debe ser booleano");
   d.activo = b.activo;
   return d;
};

export const CourseService = {
   async list({ esAdmin }) {
      return CourseDao.findAll({ onlyActive: !esAdmin });
   },

   async get(id, { esAdmin }) {
      const c = await CourseDao.findById(id);
      if (!c || (!esAdmin && !c.activo)) fallo("CURSO_NOT_FOUND");
      return c;
   },

   async create(body) {
      const id = await CourseDao.create(validarCurso(body, { crear: true }));
      return CourseDao.findById(id);
   },

   async update(id, body) {
      const d = validarCurso(body, { crear: false });
      if (d.cupo) {
         const inscritos = await EnrollmentDao.contarInscritos(id);
         if (d.cupo < inscritos) fallo("CUPO_MENOR_A_INSCRITOS", `Hay ${inscritos} inscritos`);
      }
      const ok = await CourseDao.update(id, d);
      if (!ok) fallo("CURSO_NOT_FOUND");
      return CourseDao.findById(id);
   },

   async setActivo(id, activo) {
      return (await CourseDao.setActivo(id, activo)) ? CourseDao.findById(id) : fallo("CURSO_NOT_FOUND");
   },

   async participantes(id) {
      if (!(await CourseDao.findById(id))) fallo("CURSO_NOT_FOUND");
      return EnrollmentDao.findByCourse(id);
   },

   // Inscribe varios participantes; los ya inscritos y los ids inválidos se reportan sin abortar.
   async inscribir(id_course, ids_user, id_admin) {
      if (!Array.isArray(ids_user) || !ids_user.length || ids_user.length > 500)
         fallo("VALIDACION", "ids_user debe ser una lista de 1 a 500 ids");
      const ids = [...new Set(ids_user.map(Number))];
      if (ids.some((n) => !Number.isInteger(n) || n <= 0)) fallo("VALIDACION", "ids_user contiene ids inválidos");

      return withTransaction(async (client) => {
         const curso = await CourseDao.lockById(id_course, client);
         if (!curso) fallo("CURSO_NOT_FOUND");
         if (!curso.activo) fallo("CURSO_INACTIVO");
         const resultado = { inscritos: [], ya_inscritos: [], no_validos: [] };
         let ocupados = await EnrollmentDao.contarInscritos(id_course, client);
         for (const id_user of ids) {
            const u = await UserDao.findById(id_user, client);
            if (!u || u.rol !== "PARTICIPANTE") {
               resultado.no_validos.push(id_user);
               continue;
            }
            const e = await EnrollmentDao.findOne(id_user, id_course, client);
            if (e?.estatus === "INSCRITO") {
               resultado.ya_inscritos.push(id_user);
               continue;
            }
            if (curso.cupo && ocupados >= curso.cupo) fallo("CURSO_SIN_CUPO", `Cupo de ${curso.cupo} lugares`);
            await EnrollmentDao.upsertInscrito({ id_user, id_course, id_admin }, client);
            ocupados++;
            resultado.inscritos.push(id_user);
         }
         return resultado;
      });
   },

   async cambiarEstatusInscripcion(id_course, id_user, estatus) {
      if (!["INSCRITO", "CANCELADO"].includes(estatus)) fallo("VALIDACION", "Estatus inválido");
      if (estatus === "INSCRITO") return this.inscribir(id_course, [id_user], null);
      const ok = await EnrollmentDao.setEstatus(id_user, id_course, estatus);
      if (!ok) fallo("INSCRIPCION_NOT_FOUND");
      return { id_user, id_course, estatus };
   },
};
