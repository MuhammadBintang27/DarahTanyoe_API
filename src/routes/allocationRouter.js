import express from 'express';
import allocationController from '../controllers/allocationController.js';

const allocationRouter = express.Router();

/**
 * Blood Allocation Routes (Opsi 2)
 * Handles blood allocation tracking and pickup management
 * 
 * IMPORTANT: More specific routes must come BEFORE generic ones!
 */

// ============ SPECIFIC REQUEST ROUTES (must be before :allocation_id routes) ============

// Get blood with free stock options (flexible source)
// GET /allocation/request/:blood_request_id/with-free-stock
// Returns allocated blood + available free stock that can be picked up together
allocationRouter.get('/request/:blood_request_id/with-free-stock', allocationController.getBloodWithFreeStock);

// Get allocation history for a blood request
// GET /allocation/request/:blood_request_id/history
allocationRouter.get('/request/:blood_request_id/history', allocationController.getAllocationHistoryForRequest);

// Get available blood for a blood request (for pickup scheduling)
// GET /allocation/request/:blood_request_id/available
allocationRouter.get('/request/:blood_request_id/available', allocationController.getAvailableBloodForRequest);

// Get pending pickups for a blood request
// GET /allocation/request/:blood_request_id/pending
allocationRouter.get('/request/:blood_request_id/pending', allocationController.getPendingPickupsForRequest);

// Confirm pickup with combined sources (allocation + free stock)
// POST /allocation/request/:blood_request_id/confirm-with-free-stock
// Body: {
//   pickupDate: "2026-02-01",
//   pickupTime: "10:00",
//   allocations: [{ allocation_id, quantity_picked_up }],
//   free_stock: [{ stock_id, quantity_picked_up }]
// }
allocationRouter.post('/request/:blood_request_id/confirm-with-free-stock', allocationController.confirmPickupWithFreeStock);

// ============ GENERIC ALLOCATION ROUTES ============

// Cancel an allocation
// POST /allocation/:allocation_id/cancel
// Body: { reason?: string }
allocationRouter.post('/:allocation_id/cancel', allocationController.cancelAllocation);

export default allocationRouter;
