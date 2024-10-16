import { Router } from "express";
import { ingestion } from "./ingestion";
import { devices } from "./devices";

const router = Router();

router.use("/ingestion", ingestion);
router.use("/devices", devices);

export default router;
