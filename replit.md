# Tajik Music Distribution CRM

## Overview

A comprehensive Music Distribution CRM and Admin Panel for a Tajik music label. This full-stack application provides catalog management, CRM functionalities, analytics, financial management, DDEX delivery, and publishing rights management. The project aims to streamline operations for music labels, offering tools for managing artists, releases, royalties, and external DSP integrations.

## User Preferences

- **Workflow on Replit**: Should simply run dev-servers (`pnpm --filter ... run dev`). Do not change them to `pnpm build && pnpm start` or production mode, as this will break the preview.
- **Deployment**: Deployment is done ONLY by pushing to `main` on GitHub, then accessing the VPS via SSH, and running `bash /var/www/tajikmusic/deploy/2_deploy.sh`. There is no automation between Replit and VPS, and none is needed.
- **Git Push from Replit**: This is done via a personal token in `GITHUB_TOKEN` (Replit Secrets). If a push fails, the token in Secrets likely needs to be updated (classic PAT with `repo` scope).
- **Communication Language**: Russian.
- **Communication Style**: The user is non-technical (label owner). Do not use jargon or emojis. Explain the consequences of any actions in simple terms.
- **Deployment Requests**: If the user says "publish" or "update the website," they mean "update the code on GitHub and deploy to Timeweb," not "click the Publish button in Replit." The correct sequence is:
    1. Run `pnpm run typecheck` (also set as a pre-push hook via simple-git-hooks).
    2. `git push origin main` (with `GITHUB_TOKEN` in env).
    3. Instruct the user to run one command on the server: `cd /var/www/tajikmusic && bash deploy/2_deploy.sh`.
- **Replit Features**: Do NOT suggest Replit-specific features like "Publish" / "Deploy" through Replit Deployments, Replit Object Storage / GCS / S3 / Yandex Object Storage, Replit Database / Replit Auth / Replit AI Integrations.
- **File Storage**: Do NOT install Replit Object Storage / GCS / S3 / Yandex Object Storage. Files (covers, audio, KYC) are stored on the local filesystem of the VPS.

## System Architecture

The application is built as a monorepo using `pnpm workspaces` and Node.js 24. It utilizes TypeScript 5.9, with an Express 5 API server and a React frontend built with Vite, Wouter, Tailwind CSS, and shadcn/ui.

**Core Features & Components:**

-   **Catalog Management**: CRUD operations for artists, labels, releases, and tracks. Includes an artist invitation flow and a release creation wizard with role-based UI adjustments.
-   **CRM**: Comprehensive contacts and task management. Features a dedicated business analytics hub with overview KPIs, user activity, revenue per artist, growth charts, and release/delivery/task funnels.
-   **Financial Management**: Transaction ledger, artist/label balances, payout management with approval/rejection workflows, and revenue split definitions. Includes server-side export of transactions and payouts in Excel (.xlsx) and CSV (.csv) formats via `GET /api/finance/transactions/export` and `GET /api/finance/payouts/export`. Export buttons with format dropdown are available in the Finance Overview and Payouts panels.
-   **Royalty Hub**: User-facing royalty summaries, statements (PDF/CSV), and breakdowns by release and DSP.
-   **DDEX Delivery**: Full DDEX ERN-4.3 pipeline for message creation, batching, and acknowledgement processing. Includes SFTP transport and a robust inbound acknowledgement webhook.
-   **Publishing Rights**: Management of publishing works with dynamic writer lists and share validation.
-   **Revenue Ingestion**: CSV import functionality for DSP reports (Spotify, Apple Music, YouTube Music, TikTok) with parsing, preview, and commitment to the `transactions` and `usage_reports` tables. Includes idempotency checks and unmatched ISRC handling.
-   **Analytics**: Real analytics dashboard covering streams, revenue, geography, top tracks, UGC, alerts, playlists, and TikTok performance, all backed by real data.
-   **Communication & Automation**: Implemented communications section with email templates, campaigns, automation triggers, internal notes, and outbound webhooks.
-   **User Management & Authentication**: Role-based access control (`admin`, `manager`, `label`, `artist`) with `express-session` and `connect-pg-simple`. Data scoping is applied server-side for non-privileged users. Passwords are hashed with bcrypt.
-   **Security**: Implements Helmet for HTTP headers, CSP for production, CORS whitelist, global and specific rate limiting (e.g., login, password change), per-account lockout for brute-force protection, and role-based API endpoint protection. All secrets are managed via environment variables.
-   **Asset Storage**: Uses local filesystem storage for uploaded files (audio, covers, documents). Uploads leverage a presigned URL mechanism with HMAC signatures for security and size limits. Deduplication based on SHA256 hashes is implemented.
-   **Audit Log**: Structured compliance journal (`audit_log` table) recording detailed changes (who, what, when, before/after states, diffs) for releases, tracks, artists, labels, finance, splits, and users.
-   **UI/UX**: Features a dark navy/slate background with electric indigo accent, designed for a professional admin cockpit aesthetic. Components are built with shadcn/ui. The frontend dynamically adjusts UI elements (e.g., release creation form, settings) based on the user's role. Internationalization (i18n) is supported, primarily in Russian.
-   **Transfer Track Module**: A fully localized module for importing existing music catalogs from Spotify, including artist search and robust release/track insertion with UPC conflict resolution and buffered audit logging.
-   **CRM Business Analytics Hub**: Enhanced `/crm` page with multiple tabs for detailed business analytics, including user activity, ARPU, growth metrics, and funnels.
-   **Role-aware UX**: Settings page dynamically renders content based on user roles. Release creation wizard adapts form fields and options for artists and labels.

**Technical Implementations:**

-   **API Framework**: Express 5.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Validation**: Zod for schema validation.
-   **API Codegen**: Orval for generating API hooks from OpenAPI specs.
-   **Frontend**: React, Vite, Wouter for routing, Tailwind CSS for styling, Recharts for charts, react-hook-form for forms.
-   **Build System**: esbuild for backend, Vite for frontend.
-   **Migrations**: Drizzle versioned migrations for database schema changes, designed to be idempotent.

## External Dependencies

-   **PostgreSQL**: Primary database for all application data.
-   **Express.js**: Backend API framework.
-   **React**: Frontend UI library.
-   **Vite**: Frontend build tool.
-   **Tailwind CSS**: Utility-first CSS framework.
-   **shadcn/ui**: UI component library.
-   **Recharts**: Charting library for data visualization.
-   **react-hook-form**: Form management library.
-   **Zod**: Schema validation library.
-   **Drizzle ORM**: TypeScript ORM for PostgreSQL.
-   **Orval**: OpenAPI spec code generator.
-   **esbuild**: Fast JavaScript bundler.
-   **Wouter**: Small routing library for React.
-   **pm2**: Production process manager for Node.js applications (on VPS).
-   **nginx**: Reverse proxy server (on VPS).
-   **certbot**: For HTTPS certificate management (on VPS).
-   **Spotify Web API**: For searching artists and releases during catalog transfer.
-   **music-metadata**: Library for parsing audio file metadata (duration).
-   **csv-parse/sync**: For parsing CSV files during revenue ingestion.
-   **multer**: Middleware for handling multipart/form-data, used for file uploads.
-   **ssh2-sftp-client**: (Conditional) For SFTP transport in DDEX deliveries and polling acknowledgements.