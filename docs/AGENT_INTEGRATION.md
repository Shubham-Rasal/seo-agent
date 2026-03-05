# ERC-8004 Agent Integration Guide

This SEO Gap Analysis Agent is ERC-8004 compatible and exposes a payment-gated API via x402. Other agents can discover, pay, and consume the service programmatically.

## Discovery

### Agent Card (ERC-8004 Metadata)

Fetch the agent metadata from either URL:

- `/.well-known/agent-card.json` (standard path)
- `/api/agent-card`

```bash
curl https://seo-agent-phi.vercel.app/.well-known/agent-card.json
```

The response includes:

- **services** – API endpoints, payment requirements, request/response schemas
- **x402Support: true** – Payment via HTTP 402 + USDC
- **agentWallet** – Receiving wallet (CAIP format: `eip155:84532:0x...`)

## Payment Flow (x402)

1. **First request** (no payment): `POST /api/workflows/seo-analysis` → **402 Payment Required**
2. **Parse** `PAYMENT-REQUIRED` header for amount, network, asset, payTo
3. **Sign** EIP-3009 transfer authorization with your wallet
4. **Retry** with `PAYMENT-SIGNATURE` header → **200 OK** + `runId`

Use the [@x402/fetch](https://www.npmjs.com/package/@x402/fetch) or [@x402/evm](https://www.npmjs.com/package/@x402/evm) packages for automatic payment handling.

## API Usage

### 1. Start Analysis (x402 payment required)

```http
POST /api/workflows/seo-analysis
Content-Type: application/json

{
  "url": "https://example.com",
  "userId": "0xYourWalletAddress",
  "targetKeyword": "web design agency"
}
```

**Response (after payment):**

```json
{
  "success": true,
  "runId": "seo_1772369564721_6dji43bb4",
  "message": "SEO analysis started"
}
```

### 2. Poll Status

```http
GET /api/report/{runId}/status
```

**Response:**

```json
{
  "status": "analyzing",
  "progress": 45,
  "completedSteps": {
    "userSiteData": true,
    "discoveredKeywords": true,
    "competitorData": false,
    ...
  }
}
```

When `status` is `"completed"`, fetch the full report.

### 3. Fetch Report

```http
GET /api/report/{runId}
```

**Response:**

```json
{
  "runId": "seo_1772369564721_6dji43bb4",
  "status": "completed",
  "userUrl": "https://example.com",
  "score": 72,
  "reportData": { ... },
  "createdAt": "2026-03-01T12:00:00.000Z"
}
```

## Example: Agent with x402 Client

```typescript
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const account = privateKeyToAccount(process.env.AGENT_WALLET_PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
const signer = toClientEvmSigner(account, publicClient);

const client = new x402Client().register('eip155:84532', new ExactEvmScheme(signer));
const paymentFetch = wrapFetchWithPayment(fetch, client);

const BASE_URL = 'https://seo-agent-phi.vercel.app';

// Start analysis (payment handled automatically)
const res = await paymentFetch(`${BASE_URL}/api/workflows/seo-analysis`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com',
    userId: account.address,
    targetKeyword: 'web design',
  }),
});

const { runId } = await res.json();

// Poll until completed
let status;
do {
  const statusRes = await fetch(`${BASE_URL}/api/report/${runId}/status`);
  const data = await statusRes.json();
  status = data.status;
  await new Promise((r) => setTimeout(r, 3000));
} while (status === 'analyzing');

// Fetch report
const reportRes = await fetch(`${BASE_URL}/api/report/${runId}`);
const report = await reportRes.json();
```

## On-Chain Registration (Optional)

To register this agent on an ERC-8004 Identity Registry:

1. **Host Agent Card** – Publish the JSON at a stable URL (IPFS, Arweave, or your domain).
2. **Set env vars** (optional, for `registrations` in metadata):
   - `ERC8004_AGENT_ID` – Your agent's numeric ID after registration
   - `ERC8004_AGENT_REGISTRY` – CAIP format, e.g. `eip155:84532:0x...`
3. **Register** – Call the registry contract's `register(agentURI)` with your metadata URI.

See [Filecoin ERC-8004 registration](https://docs.filecoin.io/builder-cookbook/filecoin-pin/erc-8004-agent-registration) for a step-by-step guide.

## Pricing

- **$0.50 USDC** per analysis (Base Sepolia)
- Payment is settled on-chain via x402 facilitator

## Network

- **Base Sepolia** (chainId 84532) for testnet
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
