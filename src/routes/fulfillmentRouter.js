import express from "express";
import fulfillmentController from "../controllers/fulfillmentController.js";

const fulfillmentRouter = express.Router();

// Create fulfillment request
fulfillmentRouter.post("/", fulfillmentController.createFulfillmentRequest);

// Get all fulfillment requests
fulfillmentRouter.get("/", fulfillmentController.getAllFulfillmentRequests);

// Verify donor code
fulfillmentRouter.post("/verify-code", fulfillmentController.verifyDonorCode);

// Donor Confirm (Pendonor setuju)
fulfillmentRouter.post("/donor/confirm", fulfillmentController.donorConfirm);

// Donor Reject (Pendonor menolak)
fulfillmentRouter.post("/donor/reject", fulfillmentController.donorReject);

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

export default fulfillmentRouter;
