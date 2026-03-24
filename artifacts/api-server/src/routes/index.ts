import { Router, type IRouter } from "express";
import healthRouter from "./health";
import watchlistRouter from "./watchlist";
import alertsRouter from "./alerts";
import scanRouter from "./scan";
import configRouter from "./config";
import analyticsRouter from "./analytics";
import importRouter from "./import";

const router: IRouter = Router();

router.use(healthRouter);
router.use(watchlistRouter);
router.use(alertsRouter);
router.use(scanRouter);
router.use(configRouter);
router.use(analyticsRouter);
router.use(importRouter);

export default router;
