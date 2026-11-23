import { ParticipanteService } from "../services/participanteService.js";
import { crearResponderError } from "../utils/errores.js";

const responderError = crearResponderError("ParticipanteController", {
   VALIDACION: [400, "Datos inválidos"],
   PARTICIPANTE_NOT_FOUND: [404, "Participante no encontrado"],
   EMAIL_DUPLICADO: [409, "Ya existe una cuenta con ese correo"],
   CUENTA_INACTIVA: [409, "La cuenta está inactiva"],
   YA_ACTIVADA: [409, "La cuenta ya fue activada"],
});

const idValido = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

export const ParticipanteController = {
   async list(req, res) {
      try {
         return res.json({ success: true, data: await ParticipanteService.list(req.query) });
      } catch (err) {
         return responderError(res, "list", err);
      }
   },

   async resumen(_req, res) {
      try {
         return res.json({ success: true, data: await ParticipanteService.resumen() });
      } catch (err) {
         return responderError(res, "resumen", err);
      }
   },

   async exportar(req, res) {
      try {
         const formato = String(req.query.formato || "xlsx").toLowerCase();
         const { buffer, contentType, nombre } = await ParticipanteService.exportar(req.query, formato);
         res.setHeader("Content-Type", contentType);
         res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
         return res.send(buffer);
      } catch (err) {
         return responderError(res, "exportar", err);
      }
   },

   async getById(req, res) {
      try {
         const id = idValido(req.params.id);
         if (!id) return res.status(400).json({ success: false, message: "Id inválido" });
         return res.json({ success: true, data: await ParticipanteService.get(id) });
      } catch (err) {
         return responderError(res, "getById", err);
      }
   },

   async update(req, res) {
      try {
         const id = idValido(req.params.id);
         if (!id) return res.status(400).json({ success: false, message: "Id inválido" });
         return res.json({ success: true, data: await ParticipanteService.update(id, req.body ?? {}) });
      } catch (err) {
         return responderError(res, "update", err);
      }
   },

   async reenviarActivacion(req, res) {
      try {
         const id = idValido(req.params.id);
         if (!id) return res.status(400).json({ success: false, message: "Id inválido" });
         return res.json({ success: true, data: await ParticipanteService.reenviarActivacion(id) });
      } catch (err) {
         return responderError(res, "reenviarActivacion", err);
      }
   },

   async setActivo(req, res) {
      try {
         const id = idValido(req.params.id);
         if (!id) return res.status(400).json({ success: false, message: "Id inválido" });
         if (typeof req.body?.activo !== "boolean")
            return res.status(400).json({ success: false, message: "El campo activo debe ser booleano" });
         return res.json({ success: true, data: await ParticipanteService.setActivo(id, req.body.activo) });
      } catch (err) {
         return responderError(res, "setActivo", err);
      }
   },
};
