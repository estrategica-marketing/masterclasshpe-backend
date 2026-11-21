import { runner } from "./runner.js";

export const TokenDao = {
   async create({ id_user, token_hash, tipo, horas }, client) {
      await runner(client)(
         `INSERT INTO password_reset_tokens (id_user, token_hash, tipo, expires_at)
          VALUES ($1, $2, $3, NOW() + make_interval(hours => $4))`,
         [id_user, token_hash, tipo, horas],
      );
   },

   // Bloquea el token para que dos usos simultáneos no lo consuman dos veces.
   async findVigente(token_hash, client) {
      const r = await runner(client)(
         `SELECT id_token, id_user, tipo FROM password_reset_tokens
           WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()${client ? " FOR UPDATE" : ""}`,
         [token_hash],
      );
      return r.rows[0] || null;
   },

   // Al usar uno, se invalidan todos los pendientes del usuario.
   async invalidarDeUsuario(id_user, client) {
      await runner(client)(
         `UPDATE password_reset_tokens SET used_at = NOW() WHERE id_user = $1 AND used_at IS NULL`,
         [id_user],
      );
   },
};
