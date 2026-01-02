import express from "express";
import notificationController from "../controllers/notificationController.js";

const notificationRouter = express.Router();

// Donor notifications
notificationRouter.get("/user/:userId", notificationController.getNotificationByUserId);

// Institution notifications
notificationRouter.get("/institution/:institutionId", notificationController.getNotificationByInstitutionId);
notificationRouter.get("/institution/:institutionId/unread-count", notificationController.getUnreadCount);
notificationRouter.patch("/:notificationId/read", notificationController.markAsRead);
notificationRouter.patch("/institution/:institutionId/mark-all-read", notificationController.markAllAsRead);

// Push token management
notificationRouter.post("/push-token/register", notificationController.registerPushToken);
notificationRouter.post("/push-token/unregister", notificationController.unregisterPushToken);

// Test endpoint (for development)
notificationRouter.post("/test", notificationController.sendTestNotification);

export default notificationRouter;