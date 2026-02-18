import express from "express";
import donorReminderController from "../controllers/donorReminderController.js";

const router = express.Router();

/**
 * @route   POST /api/donor-reminder/send
 * @desc    Send WhatsApp reminder to donors who completed donation 90 days ago
 * @access  Public (but should be called via Vercel Cron with auth token)
 * @cron    Runs daily at 09:00 AM Jakarta time
 */
router.post("/send", donorReminderController.sendDonorReminders);

/**
 * @route   POST /api/donor-reminder/manual
 * @desc    Manually send reminder to specific donors (admin use)
 * @access  Public (should add auth middleware in production)
 * @body    { donor_ids: [uuid, uuid, ...] }
 */
router.post("/manual", donorReminderController.sendManualReminder);

export default router;
