import { Router } from 'express'
import dashboardController from '../controllers/dashboardController.js'

const router = Router()

// RS endpoints
router.get('/rs/:institutionId/summary', dashboardController.getHospitalSummary)
router.get('/rs/:institutionId/trends', dashboardController.getHospitalTrends)

// PMI endpoints
router.get('/pmi/:institutionId/summary', dashboardController.getPMISummary)
router.get('/pmi/:institutionId/trends', dashboardController.getPMITrends)

export default router
