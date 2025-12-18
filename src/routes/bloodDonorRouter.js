import express from 'express';
import bloodDonorController from '../controllers/bloodDonorController.js';

const bloodDonorRouter = express.Router();

bloodDonorRouter.post('/create', bloodDonorController.createBloodDonor);
bloodDonorRouter.patch('/:id/status', bloodDonorController.patchBloodDonorStatus);
bloodDonorRouter.get('/:userId', bloodDonorController.getBloodDonorByUserId);
bloodDonorRouter.get("/partner/:institutionId", bloodDonorController.getDonationOffersByPartnerId);
bloodDonorRouter.post('/verifyUniqueCode/:id', bloodDonorController.verifyUniqueCode);

export default bloodDonorRouter;