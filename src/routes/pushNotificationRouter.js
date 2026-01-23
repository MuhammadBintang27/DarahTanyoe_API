import express from 'express';
import pushNotificationController from '../controllers/pushNotificationController.js';

const router = express.Router();

/**
 * Save FCM token from mobile app
 * POST /notification/save-token
 */
router.post('/save-token', pushNotificationController.saveFCMToken);

export default router;
