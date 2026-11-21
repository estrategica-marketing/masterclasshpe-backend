import rateLimit from "express-rate-limit";

const crear = (max, minutos) =>
   rateLimit({
      windowMs: minutos * 60 * 1000,
      limit: process.env.NODE_ENV === "test" ? 10_000 : max,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { success: false, message: "Demasiados intentos. Intenta de nuevo más tarde." },
   });

export const limiteLogin = crear(10, 15);
export const limiteCorreo = crear(5, 15);
