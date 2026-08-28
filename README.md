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

The current milestone is a polished homepage and a clean Cloudflare-ready project foundation. The homepage introduces the brand, the SkillCredits concept, and the two future entry points: **Create Swap** and **Explore Swaps**.

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
├── public/                  Static public assets
├── src/
│   ├── assets/              Future local design assets
│   ├── components/
│   │   ├── brand/           Logo and brand primitives
│   │   ├── hero/            Homepage hero and ecosystem visual
│   │   ├── navigation/      Header/navigation components
│   │   └── ui/              Shared UI primitives
│   ├── pages/               Page-level React views
│   ├── styles/              Global Tailwind/CSS foundation
│   ├── App.tsx              App composition
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
