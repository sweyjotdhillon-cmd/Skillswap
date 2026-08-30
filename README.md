# ⚡ Skillswap

> **Skills are your currency.**
> A decentralized skill-exchange ecosystem where digital creators, developers, and designers swap expertise through **SkillCredits** instead of direct monetary payment.

---

## 🌟 Vision & Core Loop

Skillswap is designed to become a circular skill economy. Community members transform what they know into what they need.

```
       ┌─────────────────────────────────────────┐
       ▼                                         │
┌─────────────┐     ┌─────────────┐     ┌────────┴────────┐
│   Skills    │ ──> │    Swaps    │ ──> │  SkillCredits   │
└─────────────┘     └─────────────┘     └─────────────────┘
```

- **Swaps**: Requests for digital work (coding, design, writing, marketing, automation) offered in exchange for SkillCredits.
- **SkillCredits**: The internal unit of value earned by fulfilling Swaps and spent to request assistance.
- **Reputation**: A trust layer tracking completed Swaps, consistency, and community contributions.

---

## ⚡ Interactive Feature Explorer

<details>
<summary><b>✨ Active Features & Milestones</b> (Click to expand)</summary>

- [x] **Cloudflare & Vite Foundation**: Ultra-fast SSR and static hosting with `@cloudflare/vite-plugin` and Cloudflare Workers.
- [x] **Authentication Engine**: Email/Password authentication & Google OAuth integration via `@supabase/supabase-js`.
- [x] **Email OTP Verification**: Email verification flow with custom OTP challenges and query-param redirects.
- [x] **Secure Password Recovery**: Edge Function-backed OTP verification with Brevo email notifications and SHA-256 challenge hashing.
- [x] **Password Rules**: Minimum 8-character password enforcement across sign-up, reset, and password updates.
- [x] **Google OAuth Handling**: Seamless Google OAuth login bypassing email OTP; adaptive "Set Password" interface for passwordless OAuth users.
- [x] **Create Swap Portal**: Comprehensive form with live character counters, multi-file drag & drop, permission controls, and credit steppers.
- [x] **Explore Swaps Catalog**: Searchable and filterable marketplace for discovering active skill requests.
- [x] **Active Swaps & Swap Requests Dashboard**: Dedicated viewports for managing active swaps and incoming requests.
- [x] **Dark / Light Mode Toggle**: Adaptive global CSS theme toggler driven by `[data-theme='dark']` styling attributes.

</details>

<details>
<summary><b>🗺️ Navigation & Route Catalog</b> (Click to expand)</summary>

| Path | Access | Page / Component | Description |
| :--- | :--- | :--- | :--- |
| `/` | Public | `Home.tsx` | Landing page introducing the vision, core loop, and quick access links. |
| `/explore` | Public | `ExploreSwaps.tsx` | Marketplace listing of available Swaps with category filters and search. |
| `/about` | Public | `About.tsx` | Overview of Skillswap's mission, values, and community guidelines. |
| `/how-it-works` | Public | `HowItWorks.tsx` | Step-by-step interactive guide to earning and spending SkillCredits. |
| `/create-swap` | 🔒 Protected | `CreateSwap.tsx` | Step-by-step form to create a new Swap request with attachments & budget. |
| `/swap-requests` | 🔒 Protected | `SwapRequests.tsx` | View and respond to incoming help requests for your Swaps. |
| `/active-swaps` | 🔒 Protected | `ActiveSwaps.tsx` | Track ongoing, active Swap engagements and progress. |
| `/login` | Public | `Login.tsx` | User login with email/password or Google OAuth. Supports `redirectTo` query param. |
| `/signup` | Public | `Signup.tsx` | Account registration with automatic email pre-fill support. |
| `/verify-email` | Public | `VerifyEmailPage.tsx` | OTP verification screen for email confirmation. |
| `/forgot-password` | Public | `ForgotPasswordPage.tsx` | Triggers a 6-digit OTP request via Supabase Edge Function & Brevo API. |
| `/reset-password` | Public | `ResetPasswordPage.tsx` | Enter 6-digit OTP code to reset user password. |
| `/change-password` | 🔒 Protected | `ChangePasswordPage.tsx` | Update current password or set initial password for OAuth users. |

</details>

---

## 🏗️ System Architecture

```text
                                  ┌───────────────────────────┐
                                  │      Cloudflare Edge      │
                                  │   (Cloudflare Workers)    │
                                  └─────────────┬─────────────┘
                                                │
                                  ┌─────────────▼─────────────┐
                                  │    React + Vite Client    │
                                  │   (Tailwind & Contexts)   │
                                  └─────────────┬─────────────┘
                                                │
                      ┌─────────────────────────┴─────────────────────────┐
                      │                                                   │
        ┌─────────────▼─────────────┐                       ┌─────────────▼─────────────┐
        │       Supabase Auth       │                       │    Supabase Edge Functions│
        │  (Email OTP & OAuth)      │                       │  (Brevo OTP & Challenges) │
        └─────────────┬─────────────┘                       └─────────────┬─────────────┘
                      │                                                   │
                      └─────────────────────────┬─────────────────────────┘
                                                │
                                  ┌─────────────▼─────────────┐
                                  │     PostgreSQL Engine     │
                                  │ (Triggers & Constraints)  │
                                  └───────────────────────────┘
```

<details>
<summary><b>📁 Directory Structure & Key Files</b> (Click to expand)</summary>

```text
/
├── src/
│   ├── components/
│   │   ├── brand/           Logo and brand primitives
│   │   ├── create-swap/     Create Swap page components
│   │   ├── hero/            Homepage hero and ecosystem visual
│   │   ├── navigation/      Header, nav links, and mobile menu
│   │   └── ui/              ThemeToggle, Button, Input & UI primitives
│   ├── context/             AuthContext and application state
│   ├── data/                Mock data for swaps & user profiles
│   ├── lib/                 Supabase client initialization & helper functions
│   ├── pages/               Page views (Home, Explore, CreateSwap, Auth pages, etc.)
│   ├── styles/              Global CSS & Tailwind styling setup
│   ├── App.tsx              Route routing & protective auth checks
│   └── main.tsx             Client entry point
├── worker/                  Cloudflare Worker entry point (`index.ts`)
├── supabase/
│   ├── functions/           Edge functions (password reset request/verify/complete)
│   └── migrations/          Database schemas, constraints, & triggers
├── vite.config.ts           Vite configuration with Cloudflare plugin
└── wrangler.jsonc           Cloudflare Workers deployment config
```

</details>

<details>
<summary><b>🔐 Security & Auth Architecture</b> (Click to expand)</summary>

- **Password Rules**: Minimum 8-character password constraint enforced across all authentication surfaces.
- **Password Reset Challenge System**:
  - Edge Functions use SHA-256 hashed 6-digit OTP stored in `password_reset_challenges`.
  - Email notification delivery powered by Brevo API (`BREVO_API_KEY`).
  - Single-use short-lived recovery tokens.
- **Google OAuth Integration**:
  - Automatic bypass for email OTP verification for Google OAuth users.
  - Adaptive Change Password UI allowing Google OAuth accounts to set passwords without a current password challenge.
- **Client-Side Navigation Security**:
  - Protected routes redirect unauthenticated users to `/login?redirectTo=<path>`.
  - Unverified email users are dynamically routed to `/verify-email`.

</details>

<details>
<summary><b>🗄️ Database Schemas & Storage</b> (Click to expand)</summary>

- **Identity Mapping**: Compact `public.users` mapping with `BIGINT` primary keys linked to `auth.users`.
- **User Metadata & Profiles**: `public.profiles` storing display name, bio, avatar, and immutable lowercase usernames.
- **Skills System**: Predefined system skills (`public.skills`), user skills (`public.user_skills`), and custom skills (`public.user_custom_skills`) enforcing a strict 10-skill maximum per profile.
- **SkillCredits Ledger**: Account balances tracked in `public.accounts`.

</details>

---

## 🚀 Quick Start & Development

<details open>
<summary><b>🛠️ Local Development Setup</b></summary>

### 1. Prerequisites
- Node.js `^18.0.0` or higher
- npm or pnpm

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

### 4. Run Development Server
```bash
npm run dev
```
Navigate to `http://localhost:5173` in your browser.

</details>

<details>
<summary><b>📦 Build & Deployment Commands</b> (Click to expand)</summary>

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm run dev` | Dev Server | Starts Vite dev server with live reload (`0.0.0.0`). |
| `npm run build` | Build | Compiles TypeScript (`tsc -b`) and builds production client bundle with Vite. |
| `npm run preview` | Preview | Previews production build locally. |
| `npm run deploy` | Cloudflare Deploy | Builds client asset bundle and deploys Worker using Wrangler. |

#### Cloudflare Workers Deployment Note
For Cloudflare Workers Builds, set:
- **Build command**: `npm run build`
- **Deploy command**: `npx wrangler deploy`

</details>

---

## 🛠️ Technology Stack

- **Frontend**: [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **Backend & DB**: [Supabase](https://supabase.com/) (Auth, PostgreSQL, Edge Functions)
- **Deployment & Hosting**: [Cloudflare Workers](https://workers.cloudflare.com/), `@cloudflare/vite-plugin`, Wrangler
- **Transactional Mail**: [Brevo REST API](https://www.brevo.com/)

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
