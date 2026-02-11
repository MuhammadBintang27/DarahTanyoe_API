import express from "express";
import userController from "../controllers/userController.js";

const userRouter = express.Router();

userRouter.post("/daftar", userController.completeUserProfile);
userRouter.post("/masuk", userController.signInWithPhone);
userRouter.post("/masuk-web", userController.signInWithWeb);
userRouter.post("/verifyOTP", userController.verifyOTP);
userRouter.post("/send-notification", userController.sendNotification);
userRouter.get("/poin/:userId", userController.getUserPoints);
userRouter.get("/:id", userController.getUserProfile);
userRouter.patch("/update/:id", userController.updateUserProfile);

export default userRouter;