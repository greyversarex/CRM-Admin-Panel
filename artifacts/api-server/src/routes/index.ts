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
import automationRouter from "./automation";
import automationExtrasRouter from "./automation-extras";
import catalogRouter from "./catalog";
import catalogBulkRouter from "./catalog-bulk";
import financeExtrasRouter from "./finance-extras";
import financeExportRouter from "./finance-export";
import distributionExtrasRouter from "./distribution-extras";
import analyticsExtrasRouter from "./analytics-extras";
import analyticsUgcImportRouter from "./analytics-ugc-import";
import rightsExtrasRouter from "./rights-extras";
import publishingExtrasRouter from "./publishing-extras";
import communicationsChannelsRouter from "./communications-channels";
import managerPermissionsRouter from "./manager-permissions";
import takedownsRouter from "./takedowns";
import labelMembersRouter, { labelMembersPublicRouter } from "./label-members";
import marketingRouter from "./marketing";
import analyticsMarketingRouter from "./analytics-marketing";
import { requireAuth, requireRole } from "../lib/auth";
import { requireManagerPermission } from "../lib/manager-permissions";
import { securityPolicy } from "../middlewares/security-policy";

const router: IRouter = Router();

// Public — no auth required
router.use(healthRouter);
router.use(authRouter);
// Public signup endpoint (POST /signup-requests). Admin endpoints в этом
// router'е защищены своим requireRole внутри хендлеров.
router.use(signupRouter);
// Публичные эндпоинты приёма приглашения в команду лейбла (без сессии — токен достаточно).
router.use(labelMembersPublicRouter);
// Streaming PUT-приёмник presigned-загрузок. Аутентификация по HMAC-токену
// в query, не по cookie — поэтому стоит ДО requireAuth.
router.use(storageUploadRouter);
// DDEX inbound webhook. Аутентификация по HMAC-подписи партнёра (X-DDEX-Signature),
// не по cookie — поэтому ДО requireAuth.
router.use(ddexInboundRouter);

// Apply security policy (ip whitelist + dynamic session timeout) before auth.
router.use(securityPolicy);

// All other API routes require an active session (or X-API-Key header).
router.use(requireAuth);

// Org-wide back-office modules — admin/manager only.
// Artists and labels do not directly call these endpoints; their own data is
// surfaced through the scoped artists/releases/tracks/finance/royalties routes.
const adminOnly = requireRole("admin", "manager");

router.use(dashboardRouter);          // scoped per-route inside (artist/label get filtered widgets)
router.use(artistsRouter);            // scoped per-route inside
router.use("/labels", adminOnly, requireManagerPermission("catalog"));     // labels mgmt is admin/manager only
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
router.use("/contacts", adminOnly, requireManagerPermission("crm"));
router.use("/crm", adminOnly, requireManagerPermission("crm"));
router.use(crmRouter);
router.use(financeRouter);            // scoped per-route inside
// Финансовые расширения: комиссии + 2-step approval payouts (admin/manager only — гарды внутри).
router.use(financeExtrasRouter);
// Экспорт транзакций и выплат в Excel/CSV (scoped per-route inside).
router.use(financeExportRouter);
// CSV-импорт DSP-отчётов — admin/manager only (вся монетарная мутация).
router.use("/finance/ingest", adminOnly, requireManagerPermission("finance"));
router.use("/finance/imports", adminOnly, requireManagerPermission("finance"));
router.use(ingestionRouter);
router.use(royaltiesRouter);          // scoped per-route inside (entity_type/id forced from session)
router.use("/splits", adminOnly, requireManagerPermission("finance"));
router.use(splitsRouter);
router.use("/publishing", adminOnly, requireManagerPermission("rights"));
router.use(publishingRouter);
// Publishing extras: PRO registration + conflict detection (под /publishing → admin-only выше).
router.use(publishingExtrasRouter);
// Analytics — playlists + TikTok (scoped inside, allowed to label/artist too).
// Must be BEFORE the /analytics adminOnly guard so label/artist users can access it.
router.use(analyticsMarketingRouter);
router.use("/analytics", adminOnly, requireManagerPermission("analytics"));  // org-wide aggregates — admin/manager only
router.use(analyticsRouter);
// Analytics extras: UGC metrics + Realtime alerts (под /analytics → admin-only выше).
router.use(analyticsExtrasRouter);
router.use(analyticsUgcImportRouter);
// /deliveries/* + POST /releases/:id/deliver — admin/manager only.
// Гард на /releases/:id/deliver навешан в самом routes/releases.ts (под requireRole).
router.use("/deliveries", adminOnly, requireManagerPermission("distribution"));
router.use(deliveryRouter);
// Distribution extras: ACRCloud + Disputes — admin/manager only.
router.use("/distribution", adminOnly, requireManagerPermission("distribution"));
router.use(distributionExtrasRouter);
router.use("/ddex", adminOnly, requireManagerPermission("distribution"));
router.use(ddexRouter);
router.use(assetsRouter);                // scoped per-route inside (cover/audio/KYC streaming) — ДО integrationsRouter
router.use(notificationsRouter);         // /notifications — scoped to current user inside (BEFORE integrationsRouter, у которого глобальный requireRole)
router.use(supportRouter);               // /support — customer scoped or staff inbox (per-route guards inside) — также ДО integrationsRouter
// Marketing — presave, smart links, promo assets (scoped per label/artist inside)
router.use(marketingRouter);
// Takedowns — scoped per label/artist inside
router.use(takedownsRouter);
// Label members — team management for label role (scoped inside)
router.use(labelMembersRouter);
router.use("/integrations", adminOnly);  // системный admin-only без manager_permission ключа
router.use(integrationsRouter);
router.use(auditRouter);                 // /audit — admin/manager only (guarded inside)
router.use(rightsRouter);               // /rights — scoped per-route inside (label/artist see their assets)
router.use(rightsExtrasRouter);         // /rights/holders/:id/freeze + /rights/history — admin/manager only (гарды внутри)
router.use("/settings", adminOnly);     // системный — без manager_permission ключа
router.use("/api-keys", adminOnly);
router.use("/webhooks", adminOnly);
router.use(settingsRouter);
router.use("/communications", adminOnly, requireManagerPermission("support_comms"));
router.use(communicationsRouter);
router.use(communicationsChannelsRouter);     // Telegram + WhatsApp send/test (admin-only выше)
router.use("/automation", adminOnly, requireManagerPermission("automation_audit"));
router.use(automationRouter);
router.use(automationExtrasRouter);           // Payment automation rules (admin-only выше)
router.use("/catalog", adminOnly, requireManagerPermission("catalog"));
router.use(catalogRouter);
router.use(catalogBulkRouter);                // POST /catalog/bulk-edit (admin-only выше)
// Manager permissions API — admin-only, гарды внутри router'а (требуется именно admin, не "admin|manager").
router.use(managerPermissionsRouter);

export default router;
