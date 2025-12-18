import express from "express";
import institutionController from "../controllers/institutionController.js";

const institutionRouter = express.Router();

institutionRouter.post("/register", institutionController.registerInstitution);
institutionRouter.post("/login", institutionController.loginInstitution);

export default institutionRouter;
