import express from "express";
import partnerController from "../controllers/partnerController.js";

const partnerRouter = express.Router();

partnerRouter.get("/", partnerController.getPatnerWithBloodStock);
partnerRouter.post("/create", partnerController.createPartner);
partnerRouter.patch("/confirm/:requestId", partnerController.confirmRequest);
partnerRouter.patch("/approve/:requestId", partnerController.approveBloodRequest);
partnerRouter.patch("/reject/:requestId", partnerController.rejectBloodRequest);


export default partnerRouter;
