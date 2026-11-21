import nodemailer from "nodemailer";

let transporter = null;
// En tests se guardan los correos en memoria para leer los links de activación/recuperación.
export const bandejaTest = [];

const getTransporter = () => {
   if (!process.env.SMTP_HOST) return null;
   transporter ??= nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
   });
   return transporter;
};

// Nunca lanza: un correo que falla se loguea y no revierte la operación que lo originó.
export const enviarCorreo = async ({ to, subject, html, text }) => {
   if (process.env.NODE_ENV === "test") {
      bandejaTest.push({ to, subject, html, text });
      return;
   }
   const t = getTransporter();
   if (!t) {
      console.log("\x1b[33m", `[correo sin SMTP] Para: ${to} | ${subject}\n${text}`, "\x1b[0m");
      return;
   }
   try {
      await t.sendMail({ from: process.env.MAIL_FROM, to, subject, html, text });
   } catch (err) {
      console.error("\x1b[31m", "Error enviando correo a", to, err.message, "\x1b[0m");
   }
};

const COPY = {
   ACTIVACION: {
      es: {
         subject: "Activa tu cuenta – MasterClass HPE",
         titulo: "Tu registro fue recibido",
         cuerpo: "Para activar tu cuenta y crear tu contraseña, usa el siguiente enlace. Vence en 48 horas.",
         boton: "Crear contraseña",
      },
      en: {
         subject: "Activate your account – MasterClass HPE",
         titulo: "Your registration was received",
         cuerpo: "To activate your account and create your password, use the link below. It expires in 48 hours.",
         boton: "Create password",
      },
   },
   RECUPERACION: {
      es: {
         subject: "Recupera tu contraseña – MasterClass HPE",
         titulo: "Solicitud de nueva contraseña",
         cuerpo: "Usa el siguiente enlace para crear una nueva contraseña. Vence en 1 hora. Si no lo solicitaste, ignora este correo.",
         boton: "Cambiar contraseña",
      },
      en: {
         subject: "Reset your password – MasterClass HPE",
         titulo: "New password request",
         cuerpo: "Use the link below to create a new password. It expires in 1 hour. If you didn't request it, ignore this email.",
         boton: "Change password",
      },
   },
};

const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const correoToken = ({ tipo, idioma = "es", nombre, token }) => {
   const c = COPY[tipo][idioma === "en" ? "en" : "es"];
   const url = `${process.env.FRONTEND_URL}/${idioma === "en" ? "en" : "es"}/restablecer?token=${encodeURIComponent(token)}`;
   const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#292d3a">
      <div style="height:6px;background:#01a982"></div>
      <h2 style="margin:24px 0 8px">${c.titulo}</h2>
      <p>${nombre ? `${escapar(nombre)}, ` : ""}${c.cuerpo}</p>
      <p style="margin:28px 0"><a href="${url}" style="background:#01a982;color:#fff;padding:12px 22px;border-radius:24px;text-decoration:none;font-weight:bold">${c.boton}</a></p>
      <p style="font-size:12px;color:#666">${url}</p></div>`;
   return { subject: c.subject, html, text: `${c.titulo}\n${c.cuerpo}\n${url}`, url };
};
