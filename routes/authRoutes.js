import express from "express";
import { AuthController } from "../controllers/authController.js";
import { requireAuth } from "../middlewares/auth.js";
import { limiteCorreo, limiteLogin } from "../middlewares/rateLimit.js";

const router = express.Router();
router.post("/registro", limiteCorreo, AuthController.registro);
router.post("/login", limiteLogin, AuthController.login);
router.post("/logout", AuthController.logout);
router.get("/me", requireAuth, AuthController.me);
router.post("/recuperar", limiteCorreo, AuthController.recuperar);
router.post("/restablecer", limiteLogin, AuthController.restablecer);
router.put("/password", requireAuth, limiteLogin, AuthController.cambiarPassword);

export default router;
