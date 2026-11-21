import express from "express";
import { ParticipanteController } from "../controllers/participanteController.js";

// requireAuth + requireRol("ADMIN") se aplican al montar la ruta en app.js.
const router = express.Router();
router.get("/", ParticipanteController.list);
router.get("/resumen", ParticipanteController.resumen);
router.get("/exportar", ParticipanteController.exportar);
router.get("/:id", ParticipanteController.getById);
router.put("/:id", ParticipanteController.update);
router.patch("/:id/activo", ParticipanteController.setActivo);

export default router;
