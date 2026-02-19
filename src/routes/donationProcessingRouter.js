import express from "express";
import donationProcessingController from "../controllers/donationProcessingController.js";

const router = express.Router();

// Get donations pending processing (test_passed but components not created)
router.get("/pending", donationProcessingController.getPendingProcessing);

// Process donation and create blood components
router.post("/:donation_id/process", donationProcessingController.processDonation);

// Update test results for a donation
router.patch("/:donation_id/test-results", donationProcessingController.updateTestResults);

export default router;
