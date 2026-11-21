import express from "express";
import { PerfilController } from "../controllers/perfilController.js";

// requireAuth se aplica al montar la ruta en app.js.
const router = express.Router();
router.get("/", PerfilController.get);
router.put("/", PerfilController.update);
router.get("/inscripciones", PerfilController.inscripciones);

export default router;
