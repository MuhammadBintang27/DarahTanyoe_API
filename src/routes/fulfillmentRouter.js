import express from "express";
import fulfillmentController from "../controllers/fulfillmentController.js";

const fulfillmentRouter = express.Router();

// ✅ NEW: Step 1 - Search and create campaign (without notifications)
fulfillmentRouter.post("/search-and-create", fulfillmentController.searchAndCreateCampaign);

// ✅ NEW: Search eligible donors for existing fulfillment (called from pemenuhan page)
fulfillmentRouter.get("/:fulfillment_id/search-donors", fulfillmentController.searchEligibleDonorsForFulfillment);

// ✅ NEW: Step 2 - Send notifications to selected number of donors
fulfillmentRouter.post("/:campaign_id/send-notifications", fulfillmentController.sendNotificationsToSelectedDonors);

// Legacy: Create fulfillment request (backward compatible - auto-notifies all)
fulfillmentRouter.post("/", fulfillmentController.createFulfillmentRequest);

// Get all fulfillment requests
fulfillmentRouter.get("/", fulfillmentController.getAllFulfillmentRequests);

// Verify donor code
fulfillmentRouter.post("/verify-code", fulfillmentController.verifyDonorCode);

// ✅ NEW: Pre-check/Pre-create confirmation (for "Permintaan Terdekat" flow)
fulfillmentRouter.get("/donor/pre-check", fulfillmentController.preCheckConfirmation);

// Donor Confirm (Pendonor setuju)
fulfillmentRouter.post("/donor/confirm", fulfillmentController.donorConfirm);

// Donor Reject (Pendonor menolak)
fulfillmentRouter.post("/donor/reject", fulfillmentController.donorReject);

// Donor Cancel (Pendonor membatalkan setelah konfirmasi)
fulfillmentRouter.post("/donor/cancel", fulfillmentController.donorCancel);

// Complete donation
fulfillmentRouter.post("/complete-donation", fulfillmentController.completeDonation);

// Get fulfillment request by ID
fulfillmentRouter.get("/:id", fulfillmentController.getFulfillmentRequestById);

// Initiate fulfillment (search and notify donors)
fulfillmentRouter.post("/:fulfillment_id/initiate", fulfillmentController.initiateFulfillment);

// Update fulfillment status
fulfillmentRouter.patch("/:id/status", fulfillmentController.updateFulfillmentStatus);

// Get donor confirmations for a fulfillment request
fulfillmentRouter.get("/:fulfillment_id/confirmations", fulfillmentController.getDonorConfirmations);

// ✅ NEW: Get donor confirmations by donor ID (for donor history/transaction page)
fulfillmentRouter.get("/donor/:donor_id/confirmations", fulfillmentController.getDonorConfirmationsByDonorId);

export default fulfillmentRouter;
