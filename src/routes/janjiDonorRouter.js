import express from 'express';
import donorBiasaController from '../controllers/donorBiasaController.js';

const janjiDonorRouter = express.Router();

// Get active Janji Donor for current donor
janjiDonorRouter.get('/active', donorBiasaController.getActiveJanjiDonor);

// Create Janji Donor (Donor Biasa)
janjiDonorRouter.post('/create', donorBiasaController.createJanjiDonor);

// Verify Janji Donor by code (PMI)
janjiDonorRouter.post('/verify', donorBiasaController.verifyJanjiDonor);

// Cancel Janji Donor (donor)
janjiDonorRouter.post('/cancel', donorBiasaController.cancelJanjiDonor);

// Complete Janji Donor (add donation + free stock)
janjiDonorRouter.post('/complete', donorBiasaController.completeJanjiDonor);

// List Janji Donor confirmations (PMI)
janjiDonorRouter.get('/confirmations', donorBiasaController.listJanjiDonorConfirmations);

export default janjiDonorRouter;
