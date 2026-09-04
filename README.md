# SkillSwap

**SkillSwap** is a peer-to-peer digital skill exchange ecosystem where community members trade expertise directly without traditional money. Powered by **SkillCredits**, the internal currency of exchange, members transform what they know into what they need through reciprocal value creation.

---

## Table of Contents

- [Vision & Core Concept](#vision--core-concept)
- [Key Features](#key-features)
  - [1. Authentication & Security](#1-authentication--security)
  - [2. User Profiles & Skills Engine](#2-user-profiles--skills-engine)
  - [3. SkillCredits Ledger & Reservation Engine](#3-skillcredits-ledger--reservation-engine)
  - [4. Swap Creation, Draft Persistence & Attachments](#4-swap-creation-draft-persistence--attachments)
  - [5. Explore Marketplace & Discovery](#5-explore-marketplace--discovery)
  - [6. Active Swaps & Request Lifecycle](#6-active-swaps--request-lifecycle)
  - [7. Real-Time P2P Chat & Work Submission](#7-real-time-p2p-chat--work-submission)
  - [8. Upcoming Features & Roadmap](#8-upcoming-features--roadmap)
- [Technology Stack](#technology-stack)
- [Project Architecture & Directory Hierarchy](#project-architecture--directory-hierarchy)
- [Database Migrations & Security Hardening](#database-migrations--security-hardening)
- [Supabase Edge Functions](#supabase-edge-functions)
- [Environment Setup](#environment-setup)
- [Local Development & Commands](#local-development--commands)
- [Automated Integration Testing](#automated-integration-testing)
- [Security & Data Integrity Guarantees](#security--data-integrity-guarantees)

---

## Vision & Core Concept

SkillSwap is designed as a circular, human-centered skill economy. Instead of spending fiat currency on digital services, community members spend and earn SkillCredits by providing and receiving digital help.

### The Ecosystem Loop

```text
Skills → Swaps → SkillCredits → Skills
```

- **Skills**: Practical digital abilities members bring to the platform (coding, design, video editing, writing, marketing, automation, strategy, etc.).
- **Swaps**: Peer-to-peer digital service listings specifying requirements, chat preferences, creator attachments, and a SkillCredit value.
- **SkillCredits**: Internal currency earned by completing swaps and spent to request assistance from others. New users receive an initial welcome grant of **100 SkillCredits**.
* **Reputation & Community Ratings** *(Future Feature)*: Trust scores, verified swap reviews, and community badges built through completed swaps and timely deliveries.

**Product Philosophy**: *Skills are your currency.*

---

## Key Features

### 1. Authentication & Security
- **Flexible Login Options**: Supports Email/Password authentication and Google OAuth 2.0 single sign-on.
- **Email Verification**: Required email verification flow with query parameter preservation (`redirectTo`) for seamless user re-routing.
- **Atomic Password Reset Workflow**: Custom serverless password reset system backed by Supabase Edge Functions (`request-password-reset`, `verify-password-reset-otp`, `complete-password-reset`). Includes:
  - Strict attempt tracking and exponential backoff to prevent brute-force attacks.
  - Single-use, time-bound recovery tokens consumed atomically via `FOR UPDATE` row-level locks.
  - Constant-time token verification to mitigate timing attacks.
  - Strict CORS origin validation on preflight options and RPC execution.
- **Provider-Aware Password Management**: Smart Set/Change Password flow powered by the `has_user_password()` database function:
  - Users created via OAuth or Magic Link receive a streamlined "Set Password" flow without requiring a prior password.
  - Password-authenticated users require current password verification before updating.

### 2. User Profiles & Skills Engine
- **Permanent `@username` Identity**: Usernames are strictly immutable once set during profile completion, enforcing case-insensitive uniqueness across the system via the `idx_profiles_username_lower` database index.
- **Mandatory Profile Onboarding**: Uncompleted profiles are automatically directed to an interactive onboarding page enforced at the router level. Profile completion runs atomically inside PostgreSQL via the `complete_profile()` stored procedure.
- **Seeded Skills Catalog**: Comprehensive catalog seeded with predefined digital skills across 19 categories (Development, Design, AI & Machine Learning, Writing, Video & Audio, Marketing, Business & Strategy, Data, etc.).
- **Debounced Server-Side Search**: Client-side catalog search debounced at 250ms querying `public.skills` via case-insensitive `ilike` operations.
- **Custom Skill Additions**: Users can add custom skills on-the-fly via the `add_user_skill()` RPC, which handles idempotency through `ON CONFLICT DO NOTHING`.

### 3. SkillCredits Ledger & Reservation Engine
- **100 SkillCredits Welcome Grant**: Granted automatically to new accounts upon first activity via the `ensure_credit_account()` procedure.
- **Dual Balance Accounting**: Every account maintains:
  - **Available Balance** (`credits_balance`): Credits available for spending or reserving.
  - **Reserved Credits** (`credits_reserved`): Credits held in escrow for open/active swap requests.
  - **Lifetime Earned** (`credits_earned`): Total SkillCredits earned over account lifetime.
  - **Lifetime Spent** (`credits_spent`): Total SkillCredits spent over account lifetime.
- **Immutable Transaction Ledger**: All credit deductions, additions, reservations, releases, and settlements write immutable double-entry records to `public.credit_transactions`.
- **Atomic Credit Reservation**: Creating a swap immediately reserves the required credits in escrow (`credits_balance` decreases, `credits_reserved` increases), preventing overspending.
- **Balance Reconciliation RPC**: Built-in `reconcile_credit_balances()` diagnostic procedure validates full ledger integrity against active and completed commitments.
- **Interactive Credit History Modal**: Real-time modal accessible from the navigation bar detailing current available and reserved balances, lifetime totals, and expandable transaction history cards.

### 4. Swap Creation, Draft Persistence & Attachments
- **User-Scoped Draft Auto-Saving**: Form state (topic, description, attachments, chat permission, credit value, completion terms, extra note) automatically persists in `localStorage` under `skillswap_create_swap_draft_<userId>`. Drafts are automatically purged upon logout.
- **Creator Attachment Support**: Swap creators can attach reference files (up to 5 files, 25MB max per file) during swap creation, stored securely in the private `swap-attachments` bucket (`swap_attachment_files`).
- **Dynamic Business Idempotency Keys**: Generates unique idempotency keys (`swap_create:<uuid>`) per submission attempt. Retries reuse the same key to guarantee atomic, non-duplicative database creation and credit escrow.
- **Sanitized Input & Error Formatting**: User inputs are validated client-side and server-side, with raw PostgreSQL/PostgREST errors translated into friendly user messages via `formatFriendlyErrorMessage`.

### 5. Explore Marketplace & Discovery
- **Live Marketplace**: Renders real open swap listings fetched dynamically from Supabase (`getOpenSwaps()`). Zero mock data fallbacks.
- **Search & Category Filtering**: Fast keyword search across titles and descriptions alongside multi-category filters.
- **Swap Details Drawer**: Quick preview drawer allowing users to inspect requirements, credit offer, creator profile, creator attachments, and initiate swap requests directly.

### 6. Active Swaps & Request Lifecycle
- **Swap Requests (`/requests`)**:
  - **Received Requests**: Pending swap offers from other community members that can be accepted or declined.
  - **Sent Requests**: User's outbound requests with real-time status tracking and cancellation capabilities.
- **Active Swaps (`/swaps`)**:
  - **Accepted Swaps**: Swaps where the user is the designated fulfiller (participant).
  - **Given Swaps**: Swaps created by the user that have been accepted by another member.
- **Atomic State Transitions**: Controlled via PostgreSQL procedures (`create_credit_swap`, `accept_credit_swap`, `submit_credit_swap`, `complete_credit_swap`, `cancel_credit_swap`):
  - **Open**: Created and available on the marketplace; credits reserved in escrow.
  - **Accepted**: A member accepts the swap request; participant is locked.
  - **Submitted**: The fulfiller submits finished work and optional file deliverables.
  - **Completed**: The creator approves the work; reserved credits are transferred to the fulfiller's account atomically.
  - **Cancelled**: Creator cancels an unfulfilled swap; reserved credits are released back to the creator's available balance.
* **Automated Cron Schedulers for Timeouts** *(Future Feature)*: While the database layer supports timeout and abandoned swap expiry RPCs (`expire_abandoned_swaps` and `process_submitted_swap_timeouts`), automated background cron triggering (e.g. via Edge Function or pg_cron schedulers) is planned for a future release.

### 7. Real-Time P2P Chat & Work Submission
- **Supabase Realtime P2P Chat**: Active swap pages feature real-time messaging using Supabase Realtime channel subscriptions (`skillswap-chat:<swapId>`) and RLS-protected database storage (`public.swap_messages`). Access is strictly isolated to swap participants via Row Level Security (RLS).
- **Work Submission Workflow**: Fulfillers submit work deliverables with notes and file attachments.
- **Secure File Storage**:
  - Private Supabase Storage bucket (`swap-submissions`).
  - Strict upload path structure (`submissions/{swap_id}/{user_id}/{uuid}-{filename}`).
  - Multi-file uploads (up to 5 files per submission, 25MB max size per file, file-type agnostic with extension-aware MIME normalization).
  - Temporary signed URLs generated for secure file access by swap participants.

### 8. Upcoming Features & Roadmap
The following features are planned for future platform iterations and are actively being designed:
* **Ratings & Peer Reviews** *(Future Feature)*: Star ratings and written reviews after swap completion to build public member reputation scores.
* **Automated Expiry & Timeout Cron Workers** *(Future Feature)*: Scheduled background jobs executing `expire_abandoned_swaps` and `process_submitted_swap_timeouts` without manual invocation.
* **AI Skill Recommendations** *(Future Feature)*: Intelligent skill matching that connects community members based on complementary skill offers and needs.
* **Dispute Resolution & Mediation** *(Future Feature)*: Formal dispute submission and community mediation workflows for incomplete or contested work deliverables.
* **In-App & Push Notifications** *(Future Feature)*: Real-time browser and mobile notifications for new swap requests, chat messages, and work submissions.

---

## Technology Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 + TypeScript | UI composition with strict type checking |
| **Build System** | Vite | Ultra-fast local development and asset bundling |
| **Styling** | Tailwind CSS v4 + Custom CSS | Responsive layout and CSS variable-based dark/light theme engine |
| **Database & Auth** | Supabase (PostgreSQL 15+) | Authentication, database, RLS policies, Realtime, and Storage |
| **Edge Compute** | Cloudflare Workers | SSR & Edge request handling via `@cloudflare/vite-plugin` and Wrangler |
| **Serverless Functions**| Supabase Edge Functions | Deno runtime Edge Functions for secure password reset workflows |
| **Local Test Engine** | PGLite (`@electric-sql/pglite`) | In-memory WASM PostgreSQL engine for running full integration tests |

---

## Project Architecture & Directory Hierarchy

```text
skillswap/
├── src/
│   ├── assets/              # Static raster and vector media assets
│   ├── components/          # Reusable UI component library
│   │   ├── brand/           # Brand primitives and visual icons
│   │   ├── chat/            # Real-time P2P chat modal
│   │   ├── create-swap/     # Create Swap form modules & attachment uploader
│   │   ├── credits/         # SkillCredit indicators and transaction modal
│   │   ├── hero/            # Homepage hero visual and ecosystem graphic
│   │   ├── navigation/      # Desktop & mobile responsive header and drawers
│   │   ├── profile/         # Profile management & skills chips
│   │   └── ui/              # Buttons, inputs, badges, theme toggle
│   ├── context/             # AuthContext providing user state and credit methods
│   ├── lib/                 # Service integrations & utilities
│   │   ├── supabase/        # Supabase client, API wrappers, and credit logic
│   │   └── uuid.ts          # Browser-safe UUID generator
│   ├── pages/               # Top-level page views and routes
│   │   ├── ActiveSwaps.tsx  # Active swaps management & fulfillment
│   │   ├── ChangePassword.tsx# Security password updates
│   │   ├── CreateSwap.tsx   # Swap creation interface
│   │   ├── ExploreSwaps.tsx # Marketplace discovery page
│   │   ├── ForgotPassword.tsx# Password reset initiation
│   │   ├── Home.tsx         # Brand homepage & call-to-actions
│   │   ├── Login.tsx        # Sign-in view
│   │   ├── Onboarding.tsx   # Mandatory profile completion
│   │   ├── Profile.tsx      # User profile & skills view
│   │   ├── ResetPassword.tsx# Password reset token verification
│   │   ├── Signup.tsx       # Sign-up view
│   │   ├── SwapRequests.tsx # Incoming and outgoing request manager
│   │   └── VerifyEmail.tsx  # Email verification prompt
│   ├── styles/              # Global CSS foundation and theme variables
│   ├── types/               # Canonical TypeScript interfaces (Swap, Profile, etc.)
│   ├── App.tsx              # Router composition and route guards
│   └── main.tsx             # Application bootstrapper
├── supabase/
│   ├── functions/           # Deno Edge Functions
│   │   ├── _shared/         # Shared CORS headers and helpers
│   │   ├── complete-password-reset/
│   │   ├── request-password-reset/
│   │   └── verify-password-reset-otp/
│   ├── migrations/          # Incremental database migrations (001 - 023)
│   └── config.toml          # Local Supabase configuration
├── worker/                  # Cloudflare Worker entry point
├── eslint.config.js         # ESLint flat configuration (ESLint 9)
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite build config with Tailwind & Cloudflare plugins
└── wrangler.jsonc           # Cloudflare Workers configuration
```

---

## Database Migrations & Security Hardening

The database layer consists of 23 sequentially applied SQL migrations located in `supabase/migrations/`:

| Migration | Focus Area | Key Implementations |
| :--- | :--- | :--- |
| `001_password_reset_challenges` | Security | OTP password reset rate-limiting table & locking functions |
| `002_profile_and_skills_schema` | Profiles & Skills | `public.profiles`, `public.skills`, `public.user_skills`, and `complete_profile()` procedure |
| `003_anonymous_onboarding...` | Identity Linking | Anonymous user migration and identity link trigger checks |
| `004_seed_skills_catalog` | Catalog | Seeded 19 skill categories with case-insensitive `ON CONFLICT` handling |
| `005_fix_username_identity...` | Identity Integrity | Case-insensitive `@username` lower index, triggers preventing username modification |
| `006_credit_system_infra` | SkillCredits Core | `public.accounts`, `public.credit_transactions`, initial 100 SC grant procedure |
| `007_credit_system_audit` | Accounting Audit | Ledger constraints, non-negative balance enforcement (`chk_min_balance`) |
| `008_credit_reservation_system`| Escrow Engine | `credits_reserved` column, `public.credit_operations` idempotency log, atomic reservation RPCs |
| `009_secure_swap_lifecycle` | Swap State Engine | `public.swaps` schema, state machine procedures (`create_credit_swap`, `cancel_credit_swap`, etc.) |
| `010_credit_idempotency...` | Accounting Audit | Business idempotency key enforcement and `reconcile_credit_balances()` diagnostic procedure |
| `011_has_user_password_rpc` | Auth Security | `public.has_user_password()` SECURITY DEFINER procedure for provider-aware password UI |
| `012_atomic_password_reset...` | Auth Security | Single-use recovery token claim procedure (`claim_password_reset_recovery_token`) with `FOR UPDATE` locks |
| `013_chat_and_submissions` | P2P Collaboration | `public.swap_messages`, `public.swap_submissions`, `public.swap_submission_files`, and private Storage bucket |
| `014_chat_and_submission_sec` | Hardening & RLS | Strict swap participant RLS policies, Realtime publication setup, double submission protection |
| `015_swap_expiry_and_timeout` | Timeouts & Expiry | `expire_abandoned_swaps` and `process_submitted_swap_timeouts` SECURITY DEFINER procedures |
| `016_chat_rls_and_submission` | Chat & Deliverables | Bidirectional sender/recipient RLS policies on `swap_messages` |
| `017_realtime_broadcast_sec` | Realtime Security | RLS enforcement on `realtime.messages` for `skillswap-chat:<swap_id>` topic |
| `018_submission_delivery_fixes`| Deliverable Validation| Flexible `notes` constraints allowing attachment-only work submissions |
| `019_final_submission_alignment`| Storage Alignment | Storage path structure alignment (`submissions/{swap_id}/{user_id}/{filename}`) |
| `020_swap_creator_attachments` | Creator Attachments | Initial creator reference files schema and `swap-attachments` bucket setup |
| `021_creator_attachment_contract`| Contract Alignment| Contract alignment for creator attachment RPCs and storage parameters |
| `022_creator_attachment_sec` | Creator Attachments | `public.swap_attachment_files` RLS policies and `swap_attachments` compatibility view |
| `023_storage_mime_configuration`| Storage Configuration| File-type agnostic bucket configuration (`allowed_mime_types = NULL`) with 25MB limits |

---

## Supabase Edge Functions

Location: `supabase/functions/`

- **`request-password-reset`**: Validates request rate limits, generates a 6-digit OTP challenge, records challenge metadata, and delivers reset emails.
- **`verify-password-reset-otp`**: Verifies the 6-digit OTP code against attempt counts using constant-time comparison, issuing a single-use recovery token upon success.
- **`complete-password-reset`**: Atomically claims the recovery token via `FOR UPDATE` row lock and updates the user's password in `auth.users`.
- **`_shared/cors.ts`**: Provides centralized, secure CORS handling that validates incoming origins against configured production hosts and local development endpoints.

---

## Environment Setup

Create a `.env` file in the root directory based on `.env.example`:

```bash
VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
```

For Supabase Edge Functions deployment, configure the following secrets in your Supabase project:

```bash
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
ALLOWED_ORIGIN=https://your-app-domain.workers.dev
```

---

## Local Development & Commands

### 1. Installation
Install project dependencies. *Note: Use `--legacy-peer-deps` to resolve peer dependency conflicts between ESLint packages.*

```bash
npm install --legacy-peer-deps
```

### 2. Start Local Development Server
Run the local Vite dev server with Cloudflare Workers environment emulation:

```bash
npm run dev
```

### 3. Run Code Linter
Run ESLint flat config check across the repository:

```bash
npm run lint
```

### 4. Run Automated Database & Credit System Tests
Execute the local PGLite database integration test suite:

```bash
npm test
```

### 5. Build for Production
Compile TypeScript types and bundle the application with Vite:

```bash
npm run build
```

### 6. Preview Production Build
Preview the Cloudflare Worker production build locally:

```bash
npm run preview
```

### 7. Deploy to Cloudflare Workers
Deploy the application directly to Cloudflare Workers:

```bash
npm run deploy
```

---

## Automated Integration Testing

SkillSwap features an in-memory database integration test runner (`src/lib/supabase/credits.test.ts`) powered by **PGLite** (`@electric-sql/pglite`).

The test runner executes all 23 database migrations sequentially in an isolated WASM PostgreSQL instance and verifies:
1. Initial 100 SkillCredit welcome grants and initializer idempotency.
2. Atomic swap creation, credit escrow reservations, and duplicate request idempotency.
3. Insufficient balance protections and negative balance prevention.
4. Swap cancellation and atomic credit reservation releases.
5. Swap acceptance, participant locking, work submission, and credit settlement.
6. Premature settlement and unauthorized submission rejections.
7. Real-time P2P chat persistence and Row Level Security isolation.
8. Full double-entry balance accounting reconciliation via `reconcile_credit_balances()`.
9. Swap expiry and submission review timeout procedures.
10. Password reset atomic RPCs and rate limiting.
11. Deliverable validation rules and file-type agnostic MIME normalization.
12. Creator attachment uploads, metadata registration, and participant access RLS policies.

Run tests anytime with:

```bash
npm test
```

---

## Security & Data Integrity Guarantees

- **Row Level Security (RLS)**: Enabled on all database tables (`public.profiles`, `public.accounts`, `public.swaps`, `public.swap_messages`, `public.swap_submissions`, `public.swap_attachment_files`, `storage.objects`).
- **SECURITY DEFINER Encapsulation**: All credit movements, profile completions, and status changes are governed by SECURITY DEFINER stored procedures to prevent direct client table tampering.
- **Strict Username Immutability**: `@username` fields cannot be altered once created, preventing identity spoofing.
- **Idempotency Locks**: Operations use business idempotency keys recorded in `public.credit_operations` to prevent accidental double charges during network retries.
- **Sanitized Technical Errors**: Technical SQL and PostgREST error codes are intercepted and formatted into friendly, user-understandable validation messages before reaching the frontend.
