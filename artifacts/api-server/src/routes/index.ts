import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import artistsRouter from "./artists";
import labelsRouter from "./labels";
import releasesRouter from "./releases";
import tracksRouter from "./tracks";
import usersRouter from "./users";
import crmRouter from "./crm";
import financeRouter from "./finance";
import royaltiesRouter from "./royalties";
import splitsRouter from "./splits";
import publishingRouter from "./publishing";
import analyticsRouter from "./analytics";
import deliveryRouter from "./delivery";
import integrationsRouter from "./integrations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(artistsRouter);
router.use(labelsRouter);
router.use(releasesRouter);
router.use(tracksRouter);
router.use(usersRouter);
router.use(crmRouter);
router.use(financeRouter);
router.use(royaltiesRouter);
router.use(splitsRouter);
router.use(publishingRouter);
router.use(analyticsRouter);
router.use(deliveryRouter);
router.use(integrationsRouter);

export default router;
