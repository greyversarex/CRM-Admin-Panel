# Tajik Music Distribution CRM

## Overview

A comprehensive Music Distribution CRM and Admin Panel for a Tajik music label. This full-stack application provides catalog management, CRM functionalities, analytics, financial management, DDEX delivery, and publishing rights management. The project aims to streamline operations for music labels, offering tools for managing artists, releases, royalties, and external DSP integrations, thereby optimizing operational efficiency and revenue management.

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

The application is built as a monorepo using `pnpm workspaces` and Node.js 24, TypeScript 5.9. It features an Express 5 API server and a React frontend built with Vite, Wouter, Tailwind CSS, and shadcn/ui.

**Core Features & Components:**

-   **Catalog Management**: CRUD operations for artists, labels, releases, and tracks, including an artist invitation flow and a release creation wizard with role-based UI.
-   **CRM**: Contacts and task management, with a business analytics hub providing KPIs, user activity, revenue per artist, growth charts, and funnels.
-   **Financial Management**: Transaction ledger, artist/label balances, payout management with approval workflows, and revenue split definitions. Supports server-side export of financial data to Excel/CSV.
-   **Royalty Hub**: User-facing royalty summaries, statements (PDF/CSV), and breakdowns by release and DSP.
-   **DDEX Delivery**: Full DDEX ERN-4.3 pipeline for message creation, batching, and acknowledgement processing via SFTP.
-   **Publishing Rights**: Management of publishing works with dynamic writer lists and share validation.
-   **Revenue Ingestion**: CSV import functionality for DSP reports (Spotify, Apple Music, YouTube Music, TikTok) with parsing, preview, and idempotency checks.
-   **Analytics**: Real-time analytics dashboard covering streams, revenue, geography, top tracks, UGC, alerts, playlists, and TikTok performance.
-   **Communication & Automation**: Implemented communications section with email templates, campaigns, automation triggers, internal notes, and outbound webhooks.
-   **User Management & Authentication**: Role-based access control (`admin`, `manager`, `label`, `artist`) using `express-session` and `connect-pg-simple`, with server-side data scoping and bcrypt password hashing.
-   **Security**: Includes Helmet for HTTP headers, CSP for production, CORS whitelist, global and specific rate limiting, per-account lockout, and role-based API endpoint protection. All secrets are managed via environment variables.
-   **Asset Storage**: Local filesystem storage for uploaded files (audio, covers, documents) with presigned URLs, HMAC signatures, size limits, and SHA256-based deduplication.
-   **Audit Log**: Structured compliance journal recording detailed changes for releases, tracks, artists, labels, finance, splits, and users.
-   **UI/UX**: Dark navy/slate background with electric indigo accent, professional admin cockpit aesthetic. Components built with shadcn/ui. Frontend dynamically adjusts UI elements based on user roles. Internationalization (i18n) primarily in Russian.
-   **Transfer Track Module**: Localized module for importing existing music catalogs from Spotify, handling UPC conflicts.
-   **ACR and Risk Assessment**: Implements multi-layered Acoustic Copyright Recognition (ACR) checks, MusicBrainz ISRC validation, and a risk engine to assess release reputation, incorporating schema changes for `acr_checks`, `releases` (risk_score, risk_factors), and `labels` (copyright_strikes). The UI provides a "Risk Assessment" card with moderator controls and check history.
-   **Inline Release Metadata Editor**: The "Edit Release" button for drafts now switches the "Release Details" card to an inline editing mode, saving changes via `PUT /api/releases/:id`.
-   **Artist Management Enhancements**: Fixed production 401 errors by ensuring `customFetch` passes `credentials: "include"` and addressing `Secure-cookie` issues by introducing `SESSION_COOKIE_SECURE` flag. Added an endpoint `POST /api/artists/upload-image` for artist photo uploads from devices and a `phone` field for artists.
-   **Audit & Workflow Improvements**: Ensured honest artist stats and analytics data (no fakes). Improved error handling for `import-upc` and `TikTok/playlists analytics`. Implemented cross-role notifications and a full label member invitation workflow. Enhanced `testConnection()` logic for various connectors to provide accurate verification status, including handling of `unverified` states in the UI.

**Technical Implementations:**

-   **API Framework**: Express 5.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Validation**: Zod for schema validation.
-   **API Codegen**: Orval for generating API hooks from OpenAPI specs.
-   **Frontend**: React, Vite, Wouter for routing, Tailwind CSS for styling, Recharts for charts, react-hook-form for forms.
-   **Build System**: esbuild for backend, Vite for frontend.
-   **Migrations**: Drizzle versioned, idempotent migrations.

## External Dependencies

-   **PostgreSQL**: Primary database.
-   **Express.js**: Backend API framework.
-   **React**: Frontend UI library.
-   **Vite**: Frontend build tool.
-   **Tailwind CSS**: Utility-first CSS framework.
-   **shadcn/ui**: UI component library.
-   **Recharts**: Charting library.
-   **react-hook-form**: Form management.
-   **Zod**: Schema validation.
-   **Drizzle ORM**: TypeScript ORM.
-   **Orval**: OpenAPI spec code generator.
-   **esbuild**: JavaScript bundler.
-   **Wouter**: Routing library for React.
-   **pm2**: Production process manager (on VPS).
-   **nginx**: Reverse proxy server (on VPS).
-   **certbot**: HTTPS certificate management (on VPS).
-   **Spotify Web API**: For artist/release search during catalog transfer.
-   **music-metadata**: For parsing audio file metadata.
-   **csv-parse/sync**: For parsing CSV files.
-   **multer**: Middleware for file uploads.
-   **ssh2-sftp-client**: For SFTP transport in DDEX deliveries (conditional).
-   **ACRCloud**: For acoustic copyright recognition.
-   **MusicBrainz API**: For ISRC validation.