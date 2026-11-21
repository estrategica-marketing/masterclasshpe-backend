import { query } from "../db/index.js";

// Para participar en una transacción: runner(client)(sql, params).
export const runner = (client) => (client ? (text, params) => client.query(text, params) : query);
