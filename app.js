import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes.js";
import perfilRoutes from "./routes/perfilRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import participanteRoutes from "./routes/participanteRoutes.js";
import { requireAuth, requireRol } from "./middlewares/auth.js";

if (process.env.NODE_ENV !== "production") dotenv.config({ quiet: true });
process.env.TZ ??= "America/Mexico_City";
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
   throw new Error("JWT_SECRET no definido o demasiado corto (mínimo 32 caracteres)");
}

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
// La sesión viaja en cookie: CORS sólo para los orígenes del frontend, con credenciales.
const origenes = (process.env.FRONTEND_URL || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: origenes, credentials: true, exposedHeaders: ["Content-Disposition"] }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/status-api", (_req, res) => res.status(200).json({ status: "ok", updatedAt: new Date().toISOString() }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/perfil", requireAuth, perfilRoutes);
app.use("/api/v1/cursos", requireAuth, courseRoutes);
app.use("/api/v1/admin/participantes", requireAuth, requireRol("ADMIN"), participanteRoutes);

app.use((_req, res) => res.status(404).json({ success: false, message: "Recurso no encontrado" }));
// JSON mal formado u otros errores no capturados por los controllers.
app.use((err, _req, res, _next) => {
   if (err.type === "entity.parse.failed") return res.status(400).json({ success: false, message: "JSON inválido" });
   if (err.type === "entity.too.large") return res.status(413).json({ success: false, message: "Solicitud demasiado grande" });
   console.error("Error no controlado", err);
   return res.status(500).json({ success: false, message: "Error interno del servidor" });
});

export default app;
