import { withTransaction, isUniqueViolation } from "../db/index.js";
import { UserDao } from "../dao/userDao.js";
import { EnrollmentDao } from "../dao/enrollmentDao.js";
import { fallo } from "../utils/errores.js";
import { CANALES, PUESTOS, esEmail, normalizarEmail } from "../utils/validar.js";
import { generarCSV, generarXLSX } from "../utils/exportar.js";
import { validarPerfil } from "./perfilService.js";

const ETIQUETA_PUESTO = {
   preventa: "Preventa",
   comercial: "Comercial / Account Manager",
   arquitecto: "Arquitecto de soluciones",
   alianzas: "Alianzas",
   consultor: "Consultor de negocio",
   directivo: "Directivo / Dueño",
};
const ETIQUETA_CANAL = { direct: "Invitación directa", distribuidor: "Distribuidor" };

const COLUMNAS_EXPORT = [
   { campo: "id_user", titulo: "ID", ancho: 8 },
   { campo: "nombre_completo", titulo: "Nombre", ancho: 30 },
   { campo: "email", titulo: "Correo", ancho: 32 },
   { campo: "empresa", titulo: "Empresa", ancho: 26 },
   { campo: "puesto_txt", titulo: "Puesto", ancho: 26 },
   { campo: "canal_txt", titulo: "Canal de invitación", ancho: 20 },
   { campo: "contacto_referido", titulo: "Contacto / Distribuidor", ancho: 26 },
   { campo: "telefono", titulo: "Teléfono", ancho: 16 },
   { campo: "pais", titulo: "País", ancho: 16 },
   { campo: "verificado_txt", titulo: "Cuenta activada", ancho: 14 },
   { campo: "activo_txt", titulo: "Estatus", ancho: 12 },
   // Sin columnas de clases: el panel sólo consulta registros de la landing (2026-11-12).
   { campo: "created_at", titulo: "Fecha de registro", ancho: 20 },
   { campo: "last_login_at", titulo: "Último acceso", ancho: 20 },
];

const bool = (v) => (v === "true" ? true : v === "false" ? false : undefined);

export const ParticipanteService = {
   // Normaliza los filtros del query string; los valores fuera de catálogo se ignoran.
   filtros(q) {
      return {
         q: typeof q.q === "string" && q.q.trim() ? q.q.trim().slice(0, 100) : undefined,
         empresa: typeof q.empresa === "string" && q.empresa.trim() ? q.empresa.trim().slice(0, 100) : undefined,
         puesto: PUESTOS.includes(q.puesto) ? q.puesto : undefined,
         canal: CANALES.includes(q.canal) ? q.canal : undefined,
         activo: bool(q.activo),
         verificado: bool(q.verificado),
         id_course: Number(q.id_course) > 0 ? Number(q.id_course) : undefined,
      };
   },

   async list(query) {
      const page = Math.max(1, Number(query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
      const rows = await UserDao.searchParticipantes(this.filtros(query), {
         limit: pageSize,
         offset: (page - 1) * pageSize,
      });
      const total = rows[0]?.total_registros ?? 0;
      return {
         items: rows.map(({ total_registros, ...r }) => r),
         page,
         pageSize,
         total,
         totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
   },

   async get(id) {
      const u = await UserDao.findById(id);
      if (!u || u.rol !== "PARTICIPANTE") fallo("PARTICIPANTE_NOT_FOUND");
      return { ...u, inscripciones: await EnrollmentDao.findByUser(id) };
   },

   async update(id, body) {
      const d = validarPerfil(body);
      let email;
      if (body.email !== undefined) {
         email = normalizarEmail(body.email);
         if (!esEmail(email)) fallo("VALIDACION", "Correo inválido");
      }
      try {
         await withTransaction(async (client) => {
            const u = await UserDao.findById(id, client);
            if (!u || u.rol !== "PARTICIPANTE") fallo("PARTICIPANTE_NOT_FOUND");
            if (email && email !== u.email) await UserDao.updateEmail(id, email, client);
            await UserDao.updateProfile(id, d, client);
         });
      } catch (err) {
         if (isUniqueViolation(err)) fallo("EMAIL_DUPLICADO");
         throw err;
      }
      return this.get(id);
   },

   async setActivo(id, activo) {
      const u = await UserDao.findById(id);
      if (!u || u.rol !== "PARTICIPANTE") fallo("PARTICIPANTE_NOT_FOUND");
      await UserDao.setActivo(id, activo);
      return this.get(id);
   },

   async exportar(query, formato) {
      if (!["csv", "xlsx"].includes(formato)) fallo("VALIDACION", "Formato debe ser csv o xlsx");
      const filas = (await UserDao.searchParticipantes(this.filtros(query))).map((r) => ({
         ...r,
         puesto_txt: ETIQUETA_PUESTO[r.puesto] ?? "",
         canal_txt: ETIQUETA_CANAL[r.canal_invitacion] ?? "",
         verificado_txt: r.email_verificado_at ? "Sí" : "No",
         activo_txt: r.activo ? "Activo" : "Inactivo",
      }));
      const fechaArchivo = new Date().toISOString().slice(0, 10);
      if (formato === "csv") {
         return {
            buffer: Buffer.from(generarCSV(COLUMNAS_EXPORT, filas), "utf8"),
            contentType: "text/csv; charset=utf-8",
            nombre: `participantes-${fechaArchivo}.csv`,
         };
      }
      return {
         buffer: await generarXLSX(COLUMNAS_EXPORT, filas),
         contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
         nombre: `participantes-${fechaArchivo}.xlsx`,
      };
   },

   async resumen() {
      return UserDao.resumen();
   },
};
