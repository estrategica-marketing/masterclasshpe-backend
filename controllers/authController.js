import { AuthService } from "../services/authService.js";
import { COOKIE_SESION, opcionesCookie } from "../middlewares/auth.js";
import { crearResponderError } from "../utils/errores.js";

const responderError = crearResponderError("AuthController", {
   VALIDACION: [400, "Datos inválidos"],
   PASSWORD_DEBIL: [400, "La contraseña no cumple los requisitos"],
   CREDENCIALES_INVALIDAS: [401, "Correo o contraseña incorrectos"],
   CUENTA_INACTIVA: [403, "La cuenta está desactivada"],
   TOKEN_INVALIDO: [400, "El enlace no es válido o ya expiró"],
   PASSWORD_ACTUAL_INCORRECTA: [400, "La contraseña actual es incorrecta"],
   USUARIO_NOT_FOUND: [404, "Usuario no encontrado"],
});

const { maxAge, ...opcionesBorrado } = opcionesCookie();

export const AuthController = {
   async registro(req, res) {
      try {
         await AuthService.registrar(req.body ?? {});
         return res.status(202).json({
            success: true,
            data: { message: "Si los datos son válidos, recibirás un correo para activar tu cuenta." },
         });
      } catch (err) {
         return responderError(res, "registro", err);
      }
   },

   async login(req, res) {
      try {
         const { token, user } = await AuthService.login(req.body ?? {});
         res.cookie(COOKIE_SESION, token, opcionesCookie());
         return res.json({ success: true, data: user });
      } catch (err) {
         return responderError(res, "login", err);
      }
   },

   async logout(_req, res) {
      res.clearCookie(COOKIE_SESION, opcionesBorrado);
      return res.json({ success: true, data: null });
   },

   async me(req, res) {
      try {
         return res.json({ success: true, data: await AuthService.me(req.user.id_user) });
      } catch (err) {
         return responderError(res, "me", err);
      }
   },

   async recuperar(req, res) {
      try {
         await AuthService.solicitarRecuperacion(req.body ?? {});
         return res.status(202).json({
            success: true,
            data: { message: "Si el correo está registrado, recibirás un enlace para cambiar tu contraseña." },
         });
      } catch (err) {
         return responderError(res, "recuperar", err);
      }
   },

   async restablecer(req, res) {
      try {
         const data = await AuthService.restablecer(req.body ?? {});
         // Cualquier sesión abierta quedó invalidada por token_version.
         res.clearCookie(COOKIE_SESION, opcionesBorrado);
         return res.json({ success: true, data });
      } catch (err) {
         return responderError(res, "restablecer", err);
      }
   },

   async cambiarPassword(req, res) {
      try {
         const token = await AuthService.cambiarPassword(req.user.id_user, req.body ?? {});
         res.cookie(COOKIE_SESION, token, opcionesCookie());
         return res.json({ success: true, data: null });
      } catch (err) {
         return responderError(res, "cambiarPassword", err);
      }
   },
};
