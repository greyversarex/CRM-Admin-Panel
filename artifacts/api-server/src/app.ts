import express, { type Express, type Request } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === "production";

// --- Security headers ---------------------------------------------------------
//
// We apply Helmet defaults across the board. CSP is enabled only in production:
// in dev (`vite serve` + Replit preview iframe + HMR websocket) it would block
// hot-reload and Replit dev banners and add a lot of noise without adding any
// real protection. In prod the SPA assets ship from the same origin (nginx)
// so the policy can be tight.
const cspDirectives: Record<string, string[]> = {
  defaultSrc: ["'self'"],
  // Vite produces inline JSON for module preloads; keep 'unsafe-inline' off and rely on hashes from the bundle.
  scriptSrc: ["'self'"],
  // shadcn/Tailwind ship inline <style> tags and CSS-in-JS; we have to allow inline styles
  // (this is the standard accepted compromise for SPAs and does not enable script execution).
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  fontSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  workerSrc: ["'self'", "blob:"],
  objectSrc: ["'none'"],
  frameAncestors: ["'self'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};

app.use(
  helmet({
    contentSecurityPolicy: isProduction ? { directives: cspDirectives } : false,
    crossOriginEmbedderPolicy: false,
  }),
);

// --- CORS whitelist -----------------------------------------------------------
//
// Reads `WEB_ORIGINS` (CSV of allowed origins) from env. In dev we fall back
// to the Replit preview domain + localhost so local development isn't broken.
// Same-origin requests (no Origin header — server-to-server, curl, healthcheck)
// are always allowed; otherwise we reject with 403 by passing an Error to cors().
const devFallbackOrigins = [
  process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
  "http://localhost:5173",
  "http://localhost:8080",
].filter((x): x is string => Boolean(x));

const allowedOrigins = (process.env.WEB_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const effectiveAllowedOrigins =
  allowedOrigins.length > 0 ? allowedOrigins : isProduction ? [] : devFallbackOrigins;

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, cb) {
    // No Origin header → not a CORS request (curl, server-to-server, same-origin GET).
    if (!origin) return cb(null, true);
    if (effectiveAllowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed by CORS policy`));
  },
};
app.use(cors(corsOptions));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PgStore = connectPgSimple(session);

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProduction) {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }
  logger.warn("SESSION_SECRET is not set — using insecure development fallback. DO NOT deploy without setting it.");
}

app.use(
  session({
    store: new PgStore({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    name: "tm.sid",
    secret: sessionSecret || "dev-only-insecure-fallback-do-not-use-in-prod",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }),
);

// --- Global rate-limit on /api ------------------------------------------------
//
// Defence against accidental floods (a runaway client polling a list endpoint)
// and casual scraping. Per-route limiters in routes/auth.ts (login, change-password)
// are stricter and remain in effect — express-rate-limit composes naturally because
// each limiter has its own store keyed by IP and route.
//
// `keyGenerator` uses the Express-resolved IP (which respects `trust proxy=1`).
// On healthchecks and on the login endpoint itself we let the dedicated limiter
// (or no limiter) own the budget — see `skip` below.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 300 : 3000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip ?? "unknown",
  skip: (req) => req.path === "/healthz",
  message: { error: "Слишком много запросов. Подожди немного и попробуй снова." },
});
app.use("/api", apiLimiter);

app.use("/api", router);

// CORS error handler. The cors() middleware throws an Error from its origin
// callback when an Origin is not allowed; without this handler the default
// Express error handler turns it into a 500 + HTML stack trace. Map it to a
// clean 403 JSON response so clients (and our smoke tests) can rely on it.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction): void => {
  if (err instanceof Error && err.message.includes("not allowed by CORS")) {
    res.status(403).json({ error: "CORS: origin not allowed" });
    return;
  }
  next(err);
});

export default app;
