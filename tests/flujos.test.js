import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";

// BD separada: los tests la reinstalan completa.
dotenv.config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.PG_DATABASE = process.env.PG_DATABASE_TEST;

const { default: request } = await import("supertest");
const { default: app } = await import("../app.js");
const { pool } = await import("../db/index.js");
const { initTables } = await import("../models/tables.js");
const { initCatalogos } = await import("../models/catalogos.js");
const { initSeeds } = await import("../models/seeds.js");
const { bandejaTest } = await import("../utils/mail.js");

const API = "/api/v1";
const PASS = "ClaveSegura2026";
const tokenDeUltimoCorreo = (email) => {
   const correo = [...bandejaTest].reverse().find((c) => c.to === email);
   assert.ok(correo, `no llegó correo a ${email}`);
   return new URL(correo.text.match(/https?:\/\/\S+/)[0]).searchParams.get("token");
};

const registro = (over = {}) => ({
   email: "Ana.Perez@Partner.com",
   nombre_completo: "Ana Pérez",
   empresa: "Partner Tech",
   puesto: "preventa",
   canal_invitacion: "distribuidor",
   contacto_referido: "Distribuidora Norte",
   acepta_compromiso: true,
   idioma: "es",
   ...over,
});

let admin;
let participante;

before(async () => {
   process.argv.push("--force");
   await initTables();
   await initCatalogos();
   await initSeeds();
   admin = request.agent(app);
   const r = await admin.post(`${API}/auth/login`).send({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
   });
   assert.equal(r.status, 200, JSON.stringify(r.body));
});

after(async () => pool.end());

describe("autenticación y registro", () => {
   test("status-api responde", async () => {
      const r = await request(app).get("/status-api");
      assert.equal(r.status, 200);
   });

   test("registro valida datos obligatorios", async () => {
      const r = await request(app).post(`${API}/auth/registro`).send(registro({ puesto: "otro" }));
      assert.equal(r.status, 400);
      const r2 = await request(app).post(`${API}/auth/registro`).send(registro({ acepta_compromiso: false }));
      assert.equal(r2.status, 400);
   });

   test("registro → correo de activación → contraseña → login → me", async () => {
      const r = await request(app).post(`${API}/auth/registro`).send(registro());
      assert.equal(r.status, 202);
      const email = "ana.perez@partner.com";

      // Sin contraseña aún: no puede entrar.
      const sinPass = await request(app).post(`${API}/auth/login`).send({ email, password: PASS });
      assert.equal(sinPass.status, 401);

      const token = tokenDeUltimoCorreo(email);
      const debil = await request(app).post(`${API}/auth/restablecer`).send({ token, password: "corta" });
      assert.equal(debil.status, 400);
      const ok = await request(app).post(`${API}/auth/restablecer`).send({ token, password: PASS });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.data.tipo, "ACTIVACION");

      // Token de un solo uso.
      const reuso = await request(app).post(`${API}/auth/restablecer`).send({ token, password: PASS });
      assert.equal(reuso.status, 400);

      participante = request.agent(app);
      const login = await participante.post(`${API}/auth/login`).send({ email: "ANA.PEREZ@partner.com", password: PASS });
      assert.equal(login.status, 200);
      assert.match(login.headers["set-cookie"][0], /HttpOnly/);
      assert.equal(login.body.data.password_hash, undefined);

      const me = await participante.get(`${API}/auth/me`);
      assert.equal(me.status, 200);
      assert.equal(me.body.data.rol, "PARTICIPANTE");
      assert.ok(me.body.data.email_verificado_at);
   });

   test("registro duplicado responde igual y no crea otra cuenta", async () => {
      const r = await request(app).post(`${API}/auth/registro`).send(registro());
      assert.equal(r.status, 202);
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE email = 'ana.perez@partner.com'`);
      assert.equal(rows[0].n, 1);
   });

   test("login con contraseña incorrecta", async () => {
      const r = await request(app).post(`${API}/auth/login`).send({ email: "ana.perez@partner.com", password: "x" });
      assert.equal(r.status, 401);
   });

   test("recuperación de contraseña invalida la sesión anterior", async () => {
      const otra = request.agent(app);
      await otra.post(`${API}/auth/login`).send({ email: "ana.perez@partner.com", password: PASS });
      const r = await request(app).post(`${API}/auth/recuperar`).send({ email: "ana.perez@partner.com" });
      assert.equal(r.status, 202);
      const inexistente = await request(app).post(`${API}/auth/recuperar`).send({ email: "nadie@x.com" });
      assert.equal(inexistente.status, 202);

      const token = tokenDeUltimoCorreo("ana.perez@partner.com");
      const nueva = "OtraClave2026x";
      const ok = await request(app).post(`${API}/auth/restablecer`).send({ token, password: nueva });
      assert.equal(ok.body.data.tipo, "RECUPERACION");
      assert.equal((await otra.get(`${API}/auth/me`)).status, 401);

      const login = await participante.post(`${API}/auth/login`).send({ email: "ana.perez@partner.com", password: nueva });
      assert.equal(login.status, 200);
   });

   test("cambio de contraseña mantiene la sesión actual", async () => {
      const mal = await participante.put(`${API}/auth/password`).send({ actual: "no", nueva: PASS });
      assert.equal(mal.status, 400);
      const r = await participante.put(`${API}/auth/password`).send({ actual: "OtraClave2026x", nueva: PASS });
      assert.equal(r.status, 200);
      assert.equal((await participante.get(`${API}/auth/me`)).status, 200);
   });

   test("logout borra la sesión", async () => {
      const a = request.agent(app);
      await a.post(`${API}/auth/login`).send({ email: "ana.perez@partner.com", password: PASS });
      assert.equal((await a.post(`${API}/auth/logout`)).status, 200);
      assert.equal((await a.get(`${API}/auth/me`)).status, 401);
   });
});

describe("permisos", () => {
   test("sin sesión → 401", async () => {
      assert.equal((await request(app).get(`${API}/perfil`)).status, 401);
      assert.equal((await request(app).get(`${API}/admin/participantes`)).status, 401);
   });

   test("participante no entra a admin → 403", async () => {
      assert.equal((await participante.get(`${API}/admin/participantes`)).status, 403);
      assert.equal((await participante.post(`${API}/cursos`).send({ titulo: "x" })).status, 403);
   });

   test("cookie alterada → 401", async () => {
      const r = await request(app).get(`${API}/auth/me`).set("Cookie", "mc_session=abc.def.ghi");
      assert.equal(r.status, 401);
   });
});

describe("perfil", () => {
   test("actualiza su perfil y no puede tocar correo ni rol", async () => {
      const r = await participante
         .put(`${API}/perfil`)
         .send({ empresa: "Nueva Empresa", telefono: "+52 55 1234 5678", email: "hack@x.com", rol: "ADMIN" });
      assert.equal(r.status, 200);
      assert.equal(r.body.data.empresa, "Nueva Empresa");
      assert.equal(r.body.data.email, "ana.perez@partner.com");
      assert.equal(r.body.data.rol, "PARTICIPANTE");
      const mal = await participante.put(`${API}/perfil`).send({ puesto: "hacker" });
      assert.equal(mal.status, 400);
   });
});

describe("clases e inscripciones", () => {
   let idCurso;
   let idAna;

   test("admin crea, edita y desactiva clases", async () => {
      const c = await admin.post(`${API}/cursos`).send({
         titulo: "Sesión especial",
         fecha_inicio: "2026-03-10T10:00",
         duracion_min: 90,
         url_sesion: "https://meet.example.com/abc",
         cupo: 1,
      });
      assert.equal(c.status, 201, JSON.stringify(c.body));
      idCurso = c.body.data.id_course;
      assert.equal(c.body.data.fecha_inicio, "2026-03-10 10:00:00");

      const mala = await admin.post(`${API}/cursos`).send({ titulo: "x", url_sesion: "javascript:alert(1)" });
      assert.equal(mala.status, 400);

      const e = await admin.put(`${API}/cursos/${idCurso}`).send({ titulo: "Sesión especial editada" });
      assert.equal(e.body.data.titulo, "Sesión especial editada");
   });

   test("admin inscribe participante; cupo y duplicados", async () => {
      const { rows } = await pool.query(`SELECT id_user FROM users WHERE email = 'ana.perez@partner.com'`);
      idAna = rows[0].id_user;
      const r = await admin.post(`${API}/cursos/${idCurso}/inscripciones`).send({ ids_user: [idAna, 99999] });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.data.inscritos, [idAna]);
      assert.deepEqual(r.body.data.no_validos, [99999]);

      const dup = await admin.post(`${API}/cursos/${idCurso}/inscripciones`).send({ ids_user: [idAna] });
      assert.deepEqual(dup.body.data.ya_inscritos, [idAna]);

      // Segundo participante: cupo lleno.
      await request(app).post(`${API}/auth/registro`).send(registro({ email: "luis@partner.com", nombre_completo: "Luis" }));
      const { rows: r2 } = await pool.query(`SELECT id_user FROM users WHERE email = 'luis@partner.com'`);
      const lleno = await admin.post(`${API}/cursos/${idCurso}/inscripciones`).send({ ids_user: [r2[0].id_user] });
      assert.equal(lleno.status, 409);

      const lista = await admin.get(`${API}/cursos/${idCurso}/participantes`);
      assert.equal(lista.body.data.length, 1);
   });

   test("participante ve sus clases; al desactivar desaparece", async () => {
      const r = await participante.get(`${API}/perfil/inscripciones`);
      assert.equal(r.body.data.length, 1);
      assert.equal(r.body.data[0].url_sesion, "https://meet.example.com/abc");

      await admin.patch(`${API}/cursos/${idCurso}/activo`).send({ activo: false });
      assert.equal((await participante.get(`${API}/perfil/inscripciones`)).body.data.length, 0);
      assert.equal((await participante.get(`${API}/cursos/${idCurso}`)).status, 404);
      const lista = await participante.get(`${API}/cursos`);
      assert.ok(lista.body.data.every((c) => c.activo));
      await admin.patch(`${API}/cursos/${idCurso}/activo`).send({ activo: true });
   });

   test("cancelar inscripción", async () => {
      const r = await admin.patch(`${API}/cursos/${idCurso}/inscripciones/${idAna}`).send({ estatus: "CANCELADO" });
      assert.equal(r.status, 200);
      assert.equal((await participante.get(`${API}/perfil/inscripciones`)).body.data.length, 0);
      await admin.patch(`${API}/cursos/${idCurso}/inscripciones/${idAna}`).send({ estatus: "INSCRITO" });
   });
});

describe("administración de participantes", () => {
   test("búsqueda sin acentos, filtros y paginación", async () => {
      const r = await admin.get(`${API}/admin/participantes`).query({ q: "perez" });
      assert.equal(r.status, 200);
      assert.equal(r.body.data.total, 1);
      assert.equal(r.body.data.items[0].nombre_completo, "Ana Pérez");

      const noVerif = await admin.get(`${API}/admin/participantes`).query({ verificado: "false" });
      assert.deepEqual(noVerif.body.data.items.map((i) => i.email), ["luis@partner.com"]);

      const pag = await admin.get(`${API}/admin/participantes`).query({ pageSize: 1, page: 2 });
      assert.equal(pag.body.data.items.length, 1);
      assert.equal(pag.body.data.totalPages, 2);

      // Inyección en filtros: se trata como texto.
      const sqli = await admin.get(`${API}/admin/participantes`).query({ q: "' OR 1=1 --" });
      assert.equal(sqli.body.data.total, 0);
   });

   test("detalle, edición y desactivación cierran la sesión del participante", async () => {
      const { rows } = await pool.query(`SELECT id_user FROM users WHERE email = 'ana.perez@partner.com'`);
      const id = rows[0].id_user;
      const d = await admin.get(`${API}/admin/participantes/${id}`);
      assert.equal(d.body.data.inscripciones.length, 1);

      const dup = await admin.put(`${API}/admin/participantes/${id}`).send({ email: "luis@partner.com" });
      assert.equal(dup.status, 409);

      await admin.patch(`${API}/admin/participantes/${id}/activo`).send({ activo: false });
      assert.equal((await participante.get(`${API}/auth/me`)).status, 401);
      const login = await request(app).post(`${API}/auth/login`).send({ email: "ana.perez@partner.com", password: PASS });
      assert.equal(login.status, 403);
      await admin.patch(`${API}/admin/participantes/${id}/activo`).send({ activo: true });

      const adminComoParticipante = await admin.get(`${API}/admin/participantes/1`);
      assert.equal(adminComoParticipante.status, 404);
   });

   test("admin reenvía el correo de activación; el link anterior deja de servir", async () => {
      const email = "reenvio@partner.com";
      await request(app).post(`${API}/auth/registro`).send(registro({ email, nombre_completo: "Rita Reenvío" }));
      const tokenViejo = tokenDeUltimoCorreo(email);
      const { rows } = await pool.query(`SELECT id_user FROM users WHERE email = $1`, [email]);
      const id = rows[0].id_user;
      const ruta = `${API}/admin/participantes/${id}/reenviar-activacion`;

      assert.equal((await request(app).post(ruta)).status, 401);
      // La sesión de `participante` quedó cerrada al desactivarlo en el test anterior: se abre otra.
      const otro = request.agent(app);
      await otro.post(`${API}/auth/login`).send({ email: "ana.perez@partner.com", password: PASS });
      assert.equal((await otro.post(ruta)).status, 403);

      const correosAntes = bandejaTest.filter((c) => c.to === email).length;
      const r = await admin.post(ruta);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.data.email, email);
      assert.equal(bandejaTest.filter((c) => c.to === email).length, correosAntes + 1);

      const tokenNuevo = tokenDeUltimoCorreo(email);
      assert.notEqual(tokenNuevo, tokenViejo);
      const viejo = await request(app).post(`${API}/auth/restablecer`).send({ token: tokenViejo, password: PASS });
      assert.equal(viejo.status, 400);
      const nuevo = await request(app).post(`${API}/auth/restablecer`).send({ token: tokenNuevo, password: PASS });
      assert.equal(nuevo.status, 200, JSON.stringify(nuevo.body));

      // Ya activada, administrador o inexistente: no se reenvía nada.
      assert.equal((await admin.post(ruta)).status, 409);
      assert.equal((await admin.post(`${API}/admin/participantes/1/reenviar-activacion`)).status, 404);
      assert.equal((await admin.post(`${API}/admin/participantes/999999/reenviar-activacion`)).status, 404);

      // No debe alterar los conteos que verifican los tests siguientes.
      await pool.query(`DELETE FROM users WHERE id_user = $1`, [id]);
   });

   test("exporta CSV y XLSX con filtros", async () => {
      // Valor malicioso para validar neutralización de fórmulas.
      await request(app).post(`${API}/auth/registro`).send(registro({ email: "f@x.com", nombre_completo: "=HYPERLINK(1)" }));

      const csv = await admin.get(`${API}/admin/participantes/exportar`).query({ formato: "csv" }).buffer(true);
      assert.equal(csv.status, 200);
      assert.match(csv.headers["content-type"], /text\/csv/);
      assert.match(csv.headers["content-disposition"], /participantes-.*\.csv/);
      const texto = csv.text;
      assert.ok(texto.startsWith("﻿ID,Nombre,Correo"));
      assert.equal(texto.trim().split("\r\n").length, 4);
      assert.ok(texto.includes("'=HYPERLINK(1)"));

      const filtrado = await admin.get(`${API}/admin/participantes/exportar`).query({ formato: "csv", q: "luis" });
      assert.equal(filtrado.text.trim().split("\r\n").length, 2);

      const xlsx = await admin
         .get(`${API}/admin/participantes/exportar`)
         .query({ formato: "xlsx" })
         .buffer(true)
         .parse((res, cb) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => cb(null, Buffer.concat(chunks)));
         });
      assert.equal(xlsx.status, 200);
      assert.equal(xlsx.body.subarray(0, 2).toString(), "PK");

      const malo = await admin.get(`${API}/admin/participantes/exportar`).query({ formato: "pdf" });
      assert.equal(malo.status, 400);
   });

   test("resumen del panel", async () => {
      const r = await admin.get(`${API}/admin/participantes/resumen`);
      assert.equal(r.body.data.participantes, 3);
      assert.equal(r.body.data.clases_activas, 7);
   });
});
