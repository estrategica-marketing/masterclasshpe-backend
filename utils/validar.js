import { fallo } from "./errores.js";

export const PUESTOS = ["preventa", "comercial", "arquitecto", "alianzas", "consultor", "directivo"];
export const CANALES = ["direct", "distribuidor"];
export const IDIOMAS = ["es", "en"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizarEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : "");
export const esEmail = (email) => typeof email === "string" && email.length <= 160 && EMAIL_RE.test(email);

// Texto opcional: undefined = no se envió (no se toca); "" = se borra (null).
export const texto = (valor, { campo, max, requerido = false }) => {
   if (valor === undefined || valor === null) {
      if (requerido) fallo("VALIDACION", `${campo} es obligatorio`);
      return valor;
   }
   if (typeof valor !== "string") fallo("VALIDACION", `${campo} debe ser texto`);
   const limpio = valor.trim();
   if (requerido && !limpio) fallo("VALIDACION", `${campo} es obligatorio`);
   if (limpio.length > max) fallo("VALIDACION", `${campo} admite máximo ${max} caracteres`);
   return limpio || null;
};

export const enumerado = (valor, lista, { campo, requerido = false }) => {
   if (valor === undefined || valor === null || valor === "") {
      if (requerido) fallo("VALIDACION", `${campo} es obligatorio`);
      return valor === "" ? null : valor;
   }
   if (!lista.includes(valor)) fallo("VALIDACION", `${campo} no es válido`);
   return valor;
};

export const enteroPositivo = (valor, { campo, requerido = false }) => {
   if (valor === undefined || valor === null || valor === "") {
      if (requerido) fallo("VALIDACION", `${campo} es obligatorio`);
      return valor === "" ? null : valor;
   }
   const n = Number(valor);
   if (!Number.isInteger(n) || n <= 0) fallo("VALIDACION", `${campo} debe ser un entero positivo`);
   return n;
};

export const validarPassword = (password) => {
   if (typeof password !== "string" || password.length < 10 || password.length > 72)
      fallo("PASSWORD_DEBIL", "La contraseña debe tener entre 10 y 72 caracteres");
   if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
      fallo("PASSWORD_DEBIL", "La contraseña debe incluir letras y números");
   return password;
};
