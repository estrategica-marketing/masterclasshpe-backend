import express from "express";
import { CourseController } from "../controllers/courseController.js";
import { requireRol } from "../middlewares/auth.js";

// requireAuth se aplica al montar la ruta en app.js; aquí sólo se restringe a ADMIN.
const admin = requireRol("ADMIN");
const router = express.Router();
router.get("/", CourseController.list);
router.post("/", admin, CourseController.create);
router.get("/:id", CourseController.getById);
router.put("/:id", admin, CourseController.update);
router.patch("/:id/activo", admin, CourseController.setActivo);
router.get("/:id/participantes", admin, CourseController.participantes);
router.post("/:id/inscripciones", admin, CourseController.inscribir);
router.patch("/:id/inscripciones/:idUser", admin, CourseController.estatusInscripcion);

export default router;
