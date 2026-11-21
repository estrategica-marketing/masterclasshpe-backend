import jwt from "jsonwebtoken";
import { UserDao } from "../dao/userDao.js";

export const COOKIE_SESION = "mc_session";

export const opcionesCookie = () => ({
   httpOnly: true,
   secure: process.env.COOKIE_SECURE === "true",
   sameSite: process.env.COOKIE_SAMESITE || "lax",
   path: "/",
   maxAge: Number(process.env.JWT_EXPIRES_HOURS || 12) * 3600 * 1000,
});

const noAutorizado = (res) => res.status(401).json({ success: false, message: "Sesión no válida o expirada" });

// Valida el JWT de la cookie y vuelve a leer al usuario: una cuenta desactivada o con
// contraseña cambiada (token_version distinto) pierde la sesión de inmediato.
export const requireAuth = async (req, res, next) => {
   const token = req.cookies?.[COOKIE_SESION];
   if (!token) return noAutorizado(res);
   let payload;
   try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
   } catch {
      return noAutorizado(res);
   }
   try {
      const user = await UserDao.findAuthById(Number(payload.sub));
      if (!user || !user.activo || user.token_version !== payload.tv) return noAutorizado(res);
      req.user = { id_user: user.id_user, email: user.email, rol: user.rol };
      return next();
   } catch (err) {
      return next(err);
   }
};

export const requireRol =
   (...roles) =>
   (req, res, next) =>
      roles.includes(req.user?.rol)
         ? next()
         : res.status(403).json({ success: false, message: "No tienes permiso para esta acción" });
