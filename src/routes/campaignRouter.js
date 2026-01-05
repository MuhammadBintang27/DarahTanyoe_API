import express from "express";
import campaignController from "../controllers/campaignController.js";

const campaignRouter = express.Router();

// Create campaign
campaignRouter.post("/", campaignController.createCampaign);

// Get all campaigns
campaignRouter.get("/", campaignController.getAllCampaigns);

// Get campaign by ID
campaignRouter.get("/:id", campaignController.getCampaignById);

// Update campaign
campaignRouter.patch("/:id", campaignController.updateCampaign);

// Activate campaign
campaignRouter.post("/:id/activate", campaignController.activateCampaign);

// Cancel campaign
campaignRouter.post("/:id/cancel", campaignController.cancelCampaign);

// Register user to campaign
campaignRouter.post("/register", campaignController.registerToCampaign);

export default campaignRouter;
