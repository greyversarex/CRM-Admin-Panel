import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
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
import assetsRouter from "./assets";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

// Public — no auth required
router.use(healthRouter);
router.use(authRouter);

// All other API routes require an active session
router.use(requireAuth);

// Org-wide back-office modules — admin/manager only.
// Artists and labels do not directly call these endpoints; their own data is
// surfaced through the scoped artists/releases/tracks/finance/royalties routes.
const adminOnly = requireRole("admin", "manager");

router.use(dashboardRouter);          // scoped per-route inside (artist/label get filtered widgets)
router.use(artistsRouter);            // scoped per-route inside
router.use("/labels", adminOnly);     // labels mgmt is admin-only (own label info comes via /me + embeds)
router.use(labelsRouter);
router.use(releasesRouter);           // scoped per-route inside
router.use(tracksRouter);             // scoped per-route inside
// Per-route admin guard inside usersRouter so /users/me is accessible to all
// authenticated users (their own profile / password change).
router.use(usersRouter);
router.use("/contacts", adminOnly);
router.use("/crm", adminOnly);
router.use(crmRouter);
router.use(financeRouter);            // scoped per-route inside
router.use(royaltiesRouter);          // scoped per-route inside (entity_type/id forced from session)
router.use("/splits", adminOnly);
router.use(splitsRouter);
router.use("/publishing", adminOnly);
router.use(publishingRouter);
router.use("/analytics", adminOnly);  // currently mock org-wide aggregates
router.use(analyticsRouter);
router.use("/deliveries", adminOnly);
router.use(deliveryRouter);
router.use("/integrations", adminOnly);
router.use(integrationsRouter);
router.use(assetsRouter);                // scoped per-route inside

export default router;
