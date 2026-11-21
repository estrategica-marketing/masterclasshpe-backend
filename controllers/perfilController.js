import { PerfilService } from "../services/perfilService.js";
import { crearResponderError } from "../utils/errores.js";

const responderError = crearResponderError("PerfilController", {
   VALIDACION: [400, "Datos inválidos"],
   USUARIO_NOT_FOUND: [404, "Usuario no encontrado"],
});

export const PerfilController = {
   async get(req, res) {
      try {
         return res.json({ success: true, data: await PerfilService.get(req.user.id_user) });
      } catch (err) {
         return responderError(res, "get", err);
      }
   },

   async update(req, res) {
      try {
         return res.json({ success: true, data: await PerfilService.update(req.user.id_user, req.body ?? {}) });
      } catch (err) {
         return responderError(res, "update", err);
      }
   },

   async inscripciones(req, res) {
      try {
         return res.json({ success: true, data: await PerfilService.inscripciones(req.user.id_user) });
      } catch (err) {
         return responderError(res, "inscripciones", err);
      }
   },
};
