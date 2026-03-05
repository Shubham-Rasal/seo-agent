# SEO Gap Analysis Agent

AI-powered SEO analysis tool that discovers keywords, analyzes competitors, and generates actionable recommendations. Built with Next.js, x402 payments, and Hyperbrowser.

## Features

- **Autonomous Keyword Discovery**: AI identifies target keywords from your website content
- **Competitor Analysis**: Automatically fetches and analyzes top 10 ranking pages
- **Gap Identification**: Compares your site against competitors to find SEO opportunities
- **Actionable Reports**: Generates comprehensive HTML reports with prioritized recommendations
- **x402 Payments**: Pay-per-use model with USDC on Base network

## Payment Architecture

### User → SEO Agent (Base Only)
Users pay **$0.50 USDC on Base mainnet** to generate an SEO report.

**Accepted Payment:**
- Network: `eip155:8453` (Base mainnet)
- Asset: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC)

### SEO Agent → Hyperbrowser (Base)
Backend pays Hyperbrowser for web scraping using **Base USDC**.

**Hyperbrowser Endpoints Accept:**
- **Base mainnet** (eip155:8453): USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` - **Used by this app**
- **Solana mainnet** (solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp): USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` - *Not used in this demo app*

> Note: While Hyperbrowser accepts both Base and Solana, this app uses Base only for both user payments and Hyperbrowser API calls.

## Tech Stack

- **Next.js 16**: React framework with Turbopack
- **Vercel Workflow Kit**: Durable, multi-step workflow execution
- **x402 v2**: HTTP 402 payment protocol with CDP facilitator
- **Hyperbrowser**: Web scraping with x402 payments
- **OpenAI**: GPT-4o-mini for keyword discovery and analysis
- **MongoDB**: Database for storing reports and analysis results
- **Coinbase CDP**: Embedded wallet for user payments

## Environment Variables

Create a `.env.local` file with:

```bash
# MongoDB (required)
MONGODB_URI=mongodb+srv://...

# OpenAI API
OPENAI_API_KEY=sk-...

# Coinbase Developer Platform
NEXT_PUBLIC_CDP_PROJECT_ID=...
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...

# x402 Payment Configuration
USDC_RECEIVING_WALLET_ADDRESS=0x...  # Your wallet to receive user payments
FACILITATOR_URL=https://x402.org/facilitator
NEXT_PUBLIC_NETWORK=base
USDC_CONTRACT_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

## Getting Started

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env.local
# Edit .env.local with your keys
```

3. **Run development server:**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

4. **Build for production:**
```bash
npm run build
npm start
```

## How It Works

1. **User submits URL**: Enter a website URL to analyze
2. **Payment**: User pays $0.50 USDC on Base via embedded wallet
3. **Workflow starts**: Vercel Workflow Kit executes 8-step analysis:
   - Fetch user's site (via Hyperbrowser)
   - Discover keywords (via OpenAI)
   - Search for competitors (via Hyperbrowser)
   - Fetch competitor data (via Hyperbrowser)
   - Analyze patterns (via OpenAI)
   - Identify gaps (via OpenAI)
   - Generate recommendations (via OpenAI)
   - Create HTML report (via OpenAI)
4. **Report ready**: View comprehensive SEO analysis with actionable insights

## Project Structure

```
seo-agent/
├── app/
│   ├── page.tsx                    # Landing page with URL input
│   ├── report/[runId]/page.tsx     # Report viewing page
│   └── api/
│       ├── workflows/
│       │   └── seo-analysis/
│       │       ├── route.ts        # Workflow API endpoint (x402 protected)
│       │       ├── workflow.ts     # Workflow definition
│       │       └── steps.ts        # Individual workflow steps
│       └── report/[runId]/
│           └── status/route.ts     # Report status polling
├── lib/
│   ├── payment-verification.ts     # x402 v2 server-side payment handling
│   ├── hyperbrowser.ts            # Hyperbrowser API client
│   ├── mongodb.ts                 # MongoDB client connection
│   ├── db.ts                      # Database operations (reports, pagination)
│   ├── validation.ts              # URL and input validation
│   ├── safe-errors.ts             # Error sanitization
│   ├── openai.ts                  # OpenAI client wrapper
│   └── config.ts                  # App configuration
└── components/
    └── nav-dock.tsx               # Navigation with wallet integration
```

## x402 v2 Migration Notes

This project uses **x402 v2** packages:
- `@x402/core` - Core x402 protocol types and utilities
- `@x402/evm` - EVM (Base) payment scheme
- `@x402/fetch` - Fetch wrapper with automatic payment handling
- `@coinbase/x402` - CDP facilitator configuration

See `bug.md` for full migration details from v1 to v2.

## ERC-8004 Agent API

**Production**: https://seo-agent-phi.vercel.app

This agent is **ERC-8004 compatible** and exposes a payment-gated API for other agents:

- **Agent Card**: [/.well-known/agent-card.json](https://seo-agent-phi.vercel.app/.well-known/agent-card.json) or `/api/agent-card`
- **Payment**: x402 ($0.50 USDC on Base Sepolia)
- **Flow**: POST → runId → poll status → fetch report

See [docs/AGENT_INTEGRATION.md](docs/AGENT_INTEGRATION.md) for the integration guide.

### Filecoin Pin + On-Chain Registration

One-command registration (requires filecoin-pin, cast, jq):

```bash
PRIVATE_KEY=0x... pnpm run register-agent
# Or with payment setup (first time): PRIVATE_KEY=0x... ./scripts/register-erc8004-agent.sh --setup-payments
```

See [docs/FILECOIN_PIN_REGISTRATION.md](docs/FILECOIN_PIN_REGISTRATION.md) for details.

Optional env vars (after registration):
- `ERC8004_AGENT_ID` – Agent ID from registry
- `ERC8004_AGENT_REGISTRY` – e.g. `eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e`

## Resources

- [x402 Protocol Docs](https://x402.gitbook.io/x402)
- [Hyperbrowser Docs](https://hyperbrowser.ai/docs)
- [Vercel Workflow Kit](https://vercel.com/docs/workflow)
- [Coinbase CDP Docs](https://docs.cdp.coinbase.com/)
- [CDP API Keys](https://portal.cdp.coinbase.com/)
- [ERC-8004 Best Practices](https://best-practices.8004scan.io/)

## License

MIT
