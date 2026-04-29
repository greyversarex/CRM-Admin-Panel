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
import ddexRouter, { ddexInboundRouter } from "./ddex";
import integrationsRouter from "./integrations";
import assetsRouter from "./assets";
import storageUploadRouter from "./storage-upload";
import auditRouter from "./audit";
import ingestionRouter from "./ingestion";
import signupRouter from "./signup";
import kycRouter from "./kyc";
import notificationsRouter from "./notifications";
import supportRouter from "./support";
import rightsRouter from "./rights";
import settingsRouter from "./settings";
import communicationsRouter from "./communications";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

// Public — no auth required
router.use(healthRouter);
router.use(authRouter);
// Public signup endpoint (POST /signup-requests). Admin endpoints в этом
// router'е защищены своим requireRole внутри хендлеров.
router.use(signupRouter);
// Streaming PUT-приёмник presigned-загрузок. Аутентификация по HMAC-токену
// в query, не по cookie — поэтому стоит ДО requireAuth.
router.use(storageUploadRouter);
// DDEX inbound webhook. Аутентификация по HMAC-подписи партнёра (X-DDEX-Signature),
// не по cookie — поэтому ДО requireAuth.
router.use(ddexInboundRouter);

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
// KYC и assets routes должны быть ДО integrationsRouter (который имеет
// глобальный router.use(requireRole("admin","manager")) и иначе перехватывает
// любой не-admin запрос — включая /users/me/kyc-* и /storage/objects/uploads/*
// для скачивания собственных cover/audio артистом или KYC-документа owner'ом).
router.use(kycRouter);                   // KYC docs + admin review (per-route guards inside)
router.use("/contacts", adminOnly);
router.use("/crm", adminOnly);
router.use(crmRouter);
router.use(financeRouter);            // scoped per-route inside
// CSV-импорт DSP-отчётов — admin/manager only (вся монетарная мутация).
router.use("/finance/ingest", adminOnly);
router.use("/finance/imports", adminOnly);
router.use(ingestionRouter);
router.use(royaltiesRouter);          // scoped per-route inside (entity_type/id forced from session)
router.use("/splits", adminOnly);
router.use(splitsRouter);
router.use("/publishing", adminOnly);
router.use(publishingRouter);
router.use("/analytics", adminOnly);  // currently mock org-wide aggregates
router.use(analyticsRouter);
// /deliveries/* + POST /releases/:id/deliver — admin/manager only.
// Гард на /releases/:id/deliver навешан в самом routes/releases.ts (под requireRole).
router.use("/deliveries", adminOnly);
router.use(deliveryRouter);
router.use("/ddex", adminOnly);
router.use(ddexRouter);
router.use(assetsRouter);                // scoped per-route inside (cover/audio/KYC streaming) — ДО integrationsRouter
router.use(notificationsRouter);         // /notifications — scoped to current user inside (BEFORE integrationsRouter, у которого глобальный requireRole)
router.use(supportRouter);               // /support — customer scoped or staff inbox (per-route guards inside) — также ДО integrationsRouter
router.use("/integrations", adminOnly);
router.use(integrationsRouter);
router.use(auditRouter);                 // /audit — admin/manager only (guarded inside)
router.use(rightsRouter);               // /rights — scoped per-route inside (label/artist see their assets)
router.use("/settings", adminOnly);
router.use("/api-keys", adminOnly);
router.use("/webhooks", adminOnly);
router.use(settingsRouter);
router.use("/communications", adminOnly);
router.use(communicationsRouter);

export default router;
