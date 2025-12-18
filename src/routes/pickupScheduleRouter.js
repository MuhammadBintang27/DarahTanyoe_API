import express from 'express';
import {
  createPickupSchedule,
  getPickupSchedules,
  getPickupScheduleById,
  confirmPickup,
  cancelPickupSchedule
} from '../controllers/pickupScheduleController.js';

const router = express.Router();

// Create pickup schedule (PMI only)
router.post('/', createPickupSchedule);

// Get pickup schedules (filtered by user role)
router.get('/', getPickupSchedules);

// Get pickup schedule by ID
router.get('/:id', getPickupScheduleById);

// Confirm pickup with unique code (PMI only)
router.post('/:id/confirm', confirmPickup);

// Cancel pickup schedule
router.delete('/:id', cancelPickupSchedule);

export default router;
