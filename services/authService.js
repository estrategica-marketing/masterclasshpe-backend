import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { withTransaction, isUniqueViolation } from "../db/index.js";
import { UserDao } from "../dao/userDao.js";
import { TokenDao } from "../dao/tokenDao.js";
import { fallo } from "../utils/errores.js";
import { generarToken, hashToken } from "../utils/tokens.js";
import { enviarCorreo, correoToken } from "../utils/mail.js";
import {
   CANALES,
   IDIOMAS,
   PUESTOS,
   enumerado,
   esEmail,
   normalizarEmail,
   texto,
   validarPassword,
} from "../utils/validar.js";

const BCRYPT_ROUNDS = 12;
const HORAS = { ACTIVACION: 48, RECUPERACION: 1 };
// Hash de relleno: login con correo inexistente tarda lo mismo que con uno real (evita enumerar cuentas).
const HASH_RELLENO = bcrypt.hashSync("relleno-no-valido-123", BCRYPT_ROUNDS);

const emitirTokenCorreo = async ({ id_user, email, nombre, idioma, tipo }, client) => {
   const token = generarToken();
   await TokenDao.create({ id_user, token_hash: hashToken(token), tipo, horas: HORAS[tipo] }, client);
   return { to: email, ...correoToken({ tipo, idioma, nombre, token }) };
};

export const firmarSesion = (user) =>
   jwt.sign({ sub: String(user.id_user), tv: user.token_version, rol: user.rol }, process.env.JWT_SECRET, {
      expiresIn: `${Number(process.env.JWT_EXPIRES_HOURS || 12)}h`,
   });

export const AuthService = {
   validarDatosRegistro(body) {
      const email = normalizarEmail(body.email);
      if (!esEmail(email)) fallo("VALIDACION", "Correo inválido");
      if (body.acepta_compromiso !== true) fallo("VALIDACION", "Debes aceptar el compromiso de participación");
      return {
         email,
         nombre_completo: texto(body.nombre_completo, { campo: "Nombre completo", max: 150, requerido: true }),
         empresa: texto(body.empresa, { campo: "Empresa", max: 150, requerido: true }),
         puesto: enumerado(body.puesto, PUESTOS, { campo: "Puesto", requerido: true }),
         canal_invitacion: enumerado(body.canal_invitacion, CANALES, { campo: "Canal de invitación", requerido: true }),
         contacto_referido: texto(body.contacto_referido, { campo: "Contacto", max: 150 }),
         idioma: enumerado(body.idioma, IDIOMAS, { campo: "Idioma" }) ?? "es",
         acepta_compromiso: true,
      };
   },

   // Respuesta siempre genérica: no revela si el correo ya estaba registrado.
   async registrar(body) {
      const d = this.validarDatosRegistro(body);
      let correo = null;
      try {
         correo = await withTransaction(async (client) => {
            const existente = await UserDao.findAuthByEmail(d.email, client);
            if (existente) {
               // Cuenta sin activar: se reenvía el link. Activa o de admin: no se hace nada.
               if (existente.password_hash || existente.rol !== "PARTICIPANTE" || !existente.activo) return null;
               await UserDao.updateProfile(existente.id_user, { ...d, email: undefined }, client);
               return emitirTokenCorreo({ ...existente, nombre: d.nombre_completo, idioma: d.idioma, tipo: "ACTIVACION" }, client);
            }
            const id_user = await UserDao.createUser({ email: d.email }, client);
            await UserDao.createProfile(id_user, d, client);
            return emitirTokenCorreo(
               { id_user, email: d.email, nombre: d.nombre_completo, idioma: d.idioma, tipo: "ACTIVACION" },
               client,
            );
         });
      } catch (err) {
         // Dos registros simultáneos del mismo correo: el segundo choca con el índice único.
         if (!isUniqueViolation(err)) throw err;
      }
      if (correo) await enviarCorreo(correo);
   },

   async login({ email, password }) {
      const correo = normalizarEmail(email);
      if (!esEmail(correo) || typeof password !== "string" || !password) fallo("CREDENCIALES_INVALIDAS");
      const user = await UserDao.findAuthByEmail(correo);
      const ok = await bcrypt.compare(password.slice(0, 72), user?.password_hash || HASH_RELLENO);
      if (!user || !user.password_hash || !ok) fallo("CREDENCIALES_INVALIDAS");
      if (!user.activo) fallo("CUENTA_INACTIVA");
      await UserDao.touchLogin(user.id_user);
      return { token: firmarSesion(user), user: await UserDao.findById(user.id_user) };
   },

   async solicitarRecuperacion({ email, idioma }) {
      const correo = normalizarEmail(email);
      if (!esEmail(correo)) fallo("VALIDACION", "Correo inválido");
      const user = await UserDao.findAuthByEmail(correo);
      if (!user || !user.activo) return;
      // Si nunca activó su cuenta, se le manda de nuevo el link de activación.
      const tipo = user.password_hash ? "RECUPERACION" : "ACTIVACION";
      const mensaje = await emitirTokenCorreo({
         ...user,
         nombre: user.nombre_completo,
         idioma: IDIOMAS.includes(idioma) ? idioma : user.idioma,
         tipo,
      });
      await enviarCorreo(mensaje);
   },

   // Reenvío pedido por un administrador: sólo para participantes activos que aún no activan su cuenta.
   // Los links anteriores dejan de servir; el nuevo vence en 48 h.
   async reenviarActivacion(id_user) {
      const mensaje = await withTransaction(async (client) => {
         const user = await UserDao.findById(id_user, client);
         if (!user || user.rol !== "PARTICIPANTE") fallo("PARTICIPANTE_NOT_FOUND");
         if (!user.activo) fallo("CUENTA_INACTIVA");
         if (user.email_verificado_at) fallo("YA_ACTIVADA");
         await TokenDao.invalidarDeUsuario(id_user, client);
         return emitirTokenCorreo({ ...user, nombre: user.nombre_completo, tipo: "ACTIVACION" }, client);
      });
      await enviarCorreo(mensaje);
      return { email: mensaje.to };
   },

   // Activación y recuperación comparten flujo: token de un solo uso + nueva contraseña.
   async restablecer({ token, password }) {
      if (typeof token !== "string" || token.length < 20 || token.length > 200) fallo("TOKEN_INVALIDO");
      validarPassword(password);
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      return withTransaction(async (client) => {
         const t = await TokenDao.findVigente(hashToken(token), client);
         if (!t) fallo("TOKEN_INVALIDO");
         const user = await UserDao.findAuthById(t.id_user, client);
         if (!user?.activo) fallo("CUENTA_INACTIVA");
         await UserDao.setPassword(t.id_user, hash, client);
         await TokenDao.invalidarDeUsuario(t.id_user, client);
         return { tipo: t.tipo };
      });
   },

   async cambiarPassword(id_user, { actual, nueva }) {
      if (typeof actual !== "string" || !actual) fallo("VALIDACION", "La contraseña actual es obligatoria");
      validarPassword(nueva);
      const user = await UserDao.findAuthById(id_user);
      if (!user) fallo("USUARIO_NOT_FOUND");
      if (!(await bcrypt.compare(actual.slice(0, 72), user.password_hash || HASH_RELLENO))) fallo("PASSWORD_ACTUAL_INCORRECTA");
      await UserDao.setPassword(id_user, await bcrypt.hash(nueva, BCRYPT_ROUNDS));
      // token_version subió: se emite una sesión nueva para no sacar al usuario actual.
      const actualizado = await UserDao.findAuthById(id_user);
      return firmarSesion(actualizado);
   },

   async me(id_user) {
      return (await UserDao.findById(id_user)) ?? fallo("USUARIO_NOT_FOUND");
   },
};
