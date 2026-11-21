import { CourseService } from "../services/courseService.js";
import { crearResponderError } from "../utils/errores.js";

const responderError = crearResponderError("CourseController", {
   VALIDACION: [400, "Datos inválidos"],
   CURSO_NOT_FOUND: [404, "Clase no encontrada"],
   CURSO_INACTIVO: [409, "La clase está desactivada"],
   CURSO_SIN_CUPO: [409, "La clase no tiene cupo disponible"],
   CUPO_MENOR_A_INSCRITOS: [409, "El cupo no puede ser menor a los inscritos actuales"],
   INSCRIPCION_NOT_FOUND: [404, "Inscripción no encontrada"],
});

const idValido = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const malId = (res) => res.status(400).json({ success: false, message: "Id inválido" });

export const CourseController = {
   async list(req, res) {
      try {
         return res.json({ success: true, data: await CourseService.list({ esAdmin: req.user.rol === "ADMIN" }) });
      } catch (err) {
         return responderError(res, "list", err);
      }
   },

   async getById(req, res) {
      try {
         const id = idValido(req.params.id);
         if (!id) return malId(res);
         return res.json({ success: true, data: await CourseService.get(id, { esAdmin: req.user.rol === "ADMIN" }) });
      } catch (err) {
         return responderError(res, "getById", err);
      }
   },

   async create(req, res) {
      try {
         return res.status(201).json({ success: true, data: await CourseService.create(req.body ?? {}) });
      } catch (err) {
         return responderError(res, "create", err);
      }
   },

   async update(req, res) {
      try {
         const id = idValido(req.params.id);
         if (!id) return malId(res);
         return res.json({ success: true, data: await CourseService.update(id, req.body ?? {}) });
      } catch (err) {
         return responderError(res, "update", err);
      }
   },

   async setActivo(req, res) {
      try {
         const id = idValido(req.params.id);
         if (!id) return malId(res);
         if (typeof req.body?.activo !== "boolean")
            return res.status(400).json({ success: false, message: "El campo activo debe ser booleano" });
         return res.json({ success: true, data: await CourseService.setActivo(id, req.body.activo) });
      } catch (err) {
         return responderError(res, "setActivo", err);
      }
   },

   async participantes(req, res) {
      try {
         const id = idValido(req.params.id);
         if (!id) return malId(res);
         return res.json({ success: true, data: await CourseService.participantes(id) });
      } catch (err) {
         return responderError(res, "participantes", err);
      }
   },

   async inscribir(req, res) {
      try {
         const id = idValido(req.params.id);
         if (!id) return malId(res);
         const data = await CourseService.inscribir(id, req.body?.ids_user, req.user.id_user);
         return res.json({ success: true, data });
      } catch (err) {
         return responderError(res, "inscribir", err);
      }
   },

   async estatusInscripcion(req, res) {
      try {
         const id = idValido(req.params.id);
         const idUser = idValido(req.params.idUser);
         if (!id || !idUser) return malId(res);
         const data = await CourseService.cambiarEstatusInscripcion(id, idUser, req.body?.estatus);
         return res.json({ success: true, data });
      } catch (err) {
         return responderError(res, "estatusInscripcion", err);
      }
   },
};
