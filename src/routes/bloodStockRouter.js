import express from "express";
import {
  getBloodStockByInstitution,
  adjustBloodStock,
  getStockHistory,
  markAsExpired,
  useBloodForRequest,
} from "../controllers/bloodStockController.js";

const router = express.Router();

// Get blood stock for an institution
router.get("/:institutionId", getBloodStockByInstitution);

// Get stock history for an institution
router.get("/history/:institutionId", getStockHistory);

// Adjust blood stock (add or reduce)
router.post("/adjust", adjustBloodStock);

// Mark blood as expired
router.post("/expired", markAsExpired);

// Use blood for request
router.post("/use", useBloodForRequest);

export default router;
