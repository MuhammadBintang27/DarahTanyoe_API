import express from 'express';
import { getBloodStockHistory, getBloodStockHistoryStats } from '../controllers/bloodStockHistoryController.js';

const router = express.Router();

// Get blood stock history
router.get('/', getBloodStockHistory);

// Get blood stock history statistics
router.get('/stats', getBloodStockHistoryStats);

export default router;
