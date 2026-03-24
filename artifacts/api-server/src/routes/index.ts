import { Router, type IRouter } from "express";
import healthRouter from "./health";
import watchlistRouter from "./watchlist";
import alertsRouter from "./alerts";
import scanRouter from "./scan";
import configRouter from "./config";
import analyticsRouter from "./analytics";
import importRouter from "./import";
import usaSpendingRouter from "./usaSpending";
import authRouter from "./auth";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.use(requireAuth);

router.use(watchlistRouter);
router.use(alertsRouter);
router.use(scanRouter);
router.use(configRouter);
router.use(analyticsRouter);
router.use(importRouter);
router.use(usaSpendingRouter);

export default router;
