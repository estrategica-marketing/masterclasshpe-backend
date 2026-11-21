// Error de dominio: el controller lo traduce a HTTP por su code.
export const fallo = (code, detalle) => {
   const err = new Error(code);
   err.code = code;
   if (detalle !== undefined) err.detalle = detalle;
   throw err;
};

// Respuesta de error común para todos los controllers. mapa: code -> [status, mensaje]
export const crearResponderError = (nombreController, mapa) => (res, metodo, err) => {
   const conocido = mapa[err.code];
   if (!conocido) console.error(`${nombreController}.${metodo} error`, err);
   const [status, message] = conocido ?? [500, "Error interno del servidor"];
   return res.status(status).json({ success: false, message, ...(err.detalle && { detalle: err.detalle }) });
};
