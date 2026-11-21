import { UserDao } from "../dao/userDao.js";
import { EnrollmentDao } from "../dao/enrollmentDao.js";
import { fallo } from "../utils/errores.js";
import { CANALES, IDIOMAS, PUESTOS, enumerado, texto } from "../utils/validar.js";

// Campos que el propio participante puede editar (correo, rol y estatus sólo el admin).
export const validarPerfil = (body, { parcial = true } = {}) => {
   const d = {
      nombre_completo: texto(body.nombre_completo, { campo: "Nombre completo", max: 150 }),
      empresa: texto(body.empresa, { campo: "Empresa", max: 150 }),
      puesto: enumerado(body.puesto, PUESTOS, { campo: "Puesto" }),
      canal_invitacion: enumerado(body.canal_invitacion, CANALES, { campo: "Canal de invitación" }),
      contacto_referido: texto(body.contacto_referido, { campo: "Contacto", max: 150 }),
      telefono: texto(body.telefono, { campo: "Teléfono", max: 30 }),
      pais: texto(body.pais, { campo: "País", max: 80 }),
      idioma: enumerado(body.idioma, IDIOMAS, { campo: "Idioma" }),
   };
   if (d.nombre_completo === null) fallo("VALIDACION", "Nombre completo es obligatorio");
   if (d.idioma === null) d.idioma = undefined;
   if (d.telefono && !/^[+\d\s()-]{7,30}$/.test(d.telefono)) fallo("VALIDACION", "Teléfono inválido");
   if (!parcial && !d.nombre_completo) fallo("VALIDACION", "Nombre completo es obligatorio");
   return d;
};

export const PerfilService = {
   async get(id_user) {
      return (await UserDao.findById(id_user)) ?? fallo("USUARIO_NOT_FOUND");
   },

   async update(id_user, body) {
      await UserDao.updateProfile(id_user, validarPerfil(body));
      return this.get(id_user);
   },

   async inscripciones(id_user) {
      return EnrollmentDao.findByUser(id_user, { soloInscrito: true });
   },
};
