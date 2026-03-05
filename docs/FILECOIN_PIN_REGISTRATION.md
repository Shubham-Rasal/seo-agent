# Filecoin Pin + ERC-8004 Registration

Register the SEO Gap Analysis Agent on the ERC-8004 Identity Registry with verifiable persistent storage on Filecoin.

**Base URL**: https://seo-agent-phi.vercel.app

Reference: [Filecoin Pin for ERC-8004 Agents](https://docs.filecoin.io/builder-cookbook/filecoin-pin/erc-8004-agent-registration)

---

## Quick Start (Single Script)

```bash
# Prerequisites: filecoin-pin, Foundry (cast), jq
# Tokens: tFIL + USDFC (Filecoin Calibnet), Sepolia ETH (Base Sepolia)

# First time: setup Filecoin payments
PRIVATE_KEY=0x... ./scripts/register-erc8004-agent.sh --setup-payments

# Register (testnet)
PRIVATE_KEY=0x... ./scripts/register-erc8004-agent.sh

# Register (mainnet)
PRIVATE_KEY=0x... ./scripts/register-erc8004-agent.sh --mainnet

# Custom agent card path
PRIVATE_KEY=0x... ./scripts/register-erc8004-agent.sh --agent-card path/to/agent-card.json
```

The script will: validate JSON → upload to Filecoin Pin → parse CID → register on-chain → output Agent ID and env vars.

---

## Prerequisites

1. **Filecoin Pin CLI** – [Setup guide](https://docs.filecoin.io/builder-cookbook/filecoin-pin/filecoin-pin-cli)
2. **Foundry** – `curl -L https://foundry.paradigm.xyz | bash && foundryup`
3. **jq** – `brew install jq` (macOS)

### Tokens Required

| Network | Token | Purpose |
|---------|-------|---------|
| Filecoin Calibration | tFIL | Gas fees |
| Filecoin Calibration | USDFC | Storage payments (~5 USDFC) |
| Base Sepolia | Sepolia ETH | NFT registration (~0.001 ETH) |

Same Ethereum wallet works on both networks.

---

## Manual Steps (if not using script)

### Step 1: Validate Agent Card

```bash
jq . seo-agent-card.json
```

### Step 2: Upload to Filecoin Pin

```bash
# First time only
filecoin-pin payments setup --auto

# Upload
filecoin-pin add --auto-fund seo-agent-card.json
```

Save **Root CID** from output. Token URI format: `ipfs://<ROOT_CID>/seo-agent-card.json`

### Step 3: Register on Base Sepolia

```bash
export PRIVATE_KEY="0x..."
export TOKEN_URI="ipfs://<ROOT_CID>/seo-agent-card.json"
cast send 0x8004A818BFB912233c491871b3d84c89A494BD9e "register(string)" "$TOKEN_URI" \
  --rpc-url https://sepolia.base.org --private-key $PRIVATE_KEY
```

### Step 4: Update .env (optional)

```bash
ERC8004_AGENT_ID=<agent_id_from_tx>
ERC8004_AGENT_REGISTRY=eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e
```

---

## Quick Reference

| Item | Value |
|------|-------|
| Base URL | https://seo-agent-phi.vercel.app |
| Agent Card (HTTP) | https://seo-agent-phi.vercel.app/.well-known/agent-card.json |
| API Endpoint | https://seo-agent-phi.vercel.app/api/workflows/seo-analysis |
| Payment | x402, $0.50 USDC, Base Sepolia |
| Registry (Base Sepolia) | 0x8004A818BFB912233c491871b3d84c89A494BD9e |
| Registry (Base Mainnet) | 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 |
