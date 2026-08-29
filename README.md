# Skillswap

Skillswap is a skill-exchange ecosystem where people exchange digital skills instead of directly paying money. The internal exchange currency is called **SkillCredits**.

## Vision

Skillswap is designed to become a circular skill economy where community members transform what they know into what they need. The long-term loop is simple:

**Skills → Swaps → SkillCredits → Skills**

## Core Concept

- **Swaps**: Requests for help with digital work, offered in exchange for SkillCredits.
- **SkillCredits**: The internal value unit earned by completing Swaps and spent to request help from others.
- **Skills**: Practical digital abilities people bring to the community, such as coding, design, writing, editing, marketing, automation, and strategy.
- **Reputation**: A future trust layer based on completed Swaps, helpfulness, consistency, and community contribution.

## Example

Person A needs a Python script and creates a Swap offering SkillCredits. Person B knows Python, completes the Swap, and earns those SkillCredits. Later, Person B needs video editing and spends SkillCredits on another Swap.

## Product Philosophy

**Skills are your currency.**

Skillswap should feel like a new community and exchange ecosystem, not a traditional freelancing marketplace. The product is human-centered, restrained, premium, and built around reciprocal value instead of direct payment.

## Current MVP

The current milestone is a polished homepage, a production-quality **Create Swap** page, and a clean Cloudflare-ready project foundation. The homepage introduces the brand, the SkillCredits concept, and links directly to **Create Swap**.

## Create Swap Feature

- **Route:** `/create-swap`
- **Access:** Accessible by clicking "Create Swap" on the homepage. Supports browser back navigation and header logo navigation back to homepage (`/`). Not displayed inline on homepage.
- **Form Fields & Initial State:**
  - Starts completely empty (no demo values or hardcoded defaults).
  - **Topic:** Required text input (max 120 chars) with live dynamic character counter.
  - **Description:** Required textarea (max 2000 chars) with live dynamic character counter.
  - **Attachments:** Optional file upload area supporting drag-and-drop and multiple file selection. Displays file cards with icons, filenames, formatted file sizes, and individual remove buttons.
  - **Chat Permission:** Required dual radio-card selection ("Anyone can chat with me" vs. "Ask for permission first"). Initialized to `null` with no default preselection.
  - **Credits:** Required numeric stepper input (`[-] [ ] [+] Credits`). Starts empty. Accepts positive integers.
  - **Completion Requirements:** Required textarea (max 1000 chars) with live dynamic character counter.
  - **Additional Message:** Optional textarea (max 1000 chars) with live dynamic character counter.
- **Validation:** Validates required fields upon submission and displays user-friendly inline error messages.
- **Actions:** Secondary "Save Draft" button and primary "Create Swap" button.
- **Backend Persistence:** UI and form state architecture are fully implemented. Backend persistent storage/API submission will be connected in future database milestones.

## Future Roadmap

- **Phase 1:** Homepage and Cloudflare-ready foundation
- **Phase 2:** Authentication
- **Phase 3:** User profiles and skills
- **Phase 4:** Create Swap
- **Phase 5:** Explore Swaps
- **Phase 6:** Swap fulfillment
- **Phase 7:** SkillCredits ledger
- **Phase 8:** Reputation
- **Phase 9:** Messaging and notifications
- **Phase 10:** Community growth

## Technology

- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase (Authentication)
- Cloudflare Workers
- Cloudflare Vite plugin
- Wrangler
- Cloudflare D1, R2, and KV-ready architecture for future milestones

## Deployment

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## Architecture

```text
/
├── src/
│   ├── components/
│   │   ├── brand/           Logo and brand primitives
│   │   ├── create-swap/     Create Swap page components
│   │   ├── hero/            Homepage hero and ecosystem visual
│   │   ├── navigation/      Header/navigation components
│   │   └── ui/              Shared UI primitives
│   ├── context/             React contexts (e.g., AuthContext)
│   ├── data/                Mock data
│   ├── lib/                 External service clients (e.g., Supabase)
│   ├── pages/               Page-level React views
│   ├── styles/              Global Tailwind/CSS foundation
│   ├── App.tsx              App composition and routing
│   └── main.tsx             React entry point
├── worker/                  Cloudflare Worker entry point
├── vite.config.ts           Vite + React + Tailwind + Cloudflare config
└── wrangler.jsonc           Cloudflare Workers deployment config
```

## Development Principles

- Cloudflare-first
- Free-tier-first
- Minimal dependencies
- Mobile-first and responsive
- Accessible by default
- Performance-minded
- Security-conscious
- No unnecessary complexity
- Build incrementally

## Current Limitations

Authentication, login, user accounts, database persistence, marketplace functionality, Swap creation, Swap fulfillment, messaging, notifications, payments, and real SkillCredit transactions are not implemented yet. Current buttons are intentional visual placeholders for future product flows.
