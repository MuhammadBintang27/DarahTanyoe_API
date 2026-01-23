import express from "express";
import bloodReqController from "../controllers/bloodReqController.js";

const bloodReqRouter = express.Router();

bloodReqRouter.post("/create", bloodReqController.createBloodReq);
bloodReqRouter.get("/detail/:id", bloodReqController.getBloodRequestById);
bloodReqRouter.get("/:requesterId", bloodReqController.getBloodReqByUserId);
bloodReqRouter.get("/bloodRequestsNearby/:user_id", bloodReqController.getNearbyBloodRequests);
bloodReqRouter.get("/partner/:institutionId", bloodReqController.getBloodReqByPartnerId);
bloodReqRouter.patch("/status/:id", bloodReqController.patchBloodRequestStatus);
bloodReqRouter.post("/verifyUniqueCode/:id", bloodReqController.verifyUniqueCode);

export default bloodReqRouter;
