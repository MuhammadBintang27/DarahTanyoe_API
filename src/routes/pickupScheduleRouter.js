import express from 'express';
import {
  getPickupSchedules,
  confirmPickup
} from '../controllers/pickupScheduleController.js';

const router = express.Router();

/**
 * PICKUP SCHEDULES ROUTES (Read & Confirm Only)
 * ============================================
 * 
 * For CREATING pickup schedules, use allocation endpoint:
 * POST /allocation/request/:id/confirm-with-free-stock
 * 
 * This unified endpoint handles all scenarios:
 * - Allocation-only pickups
 * - Free stock-only pickups
 * - Combined allocation + free stock pickups
 */

// Get pickup schedules (filtered by user role - PMI/Hospital)
router.get('/', getPickupSchedules);

// Confirm pickup with unique code (PMI only)
router.post('/:id/confirm', confirmPickup);

export default router;
