#!/usr/bin/env bash
#
# ERC-8004 Agent Registration Script
# Uploads agent card to Filecoin Pin and registers on Base Sepolia (or mainnet).
#
# Prerequisites: filecoin-pin CLI, Foundry (cast), jq
# Usage: PRIVATE_KEY=0x... ./scripts/register-erc8004-agent.sh [--mainnet] [--setup-payments] [--agent-card path]
#
set -e

# Config
IDENTITY_REGISTRY_SEPOLIA="0x8004A818BFB912233c491871b3d84c89A494BD9e"
IDENTITY_REGISTRY_MAINNET="0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
BASE_SEPOLIA_RPC="https://sepolia.base.org"
BASE_MAINNET_RPC="https://mainnet.base.org"
AGENT_CARD_FILE="seo-agent-card.json"
MAINNET=false
SETUP_PAYMENTS=false

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --mainnet)
      MAINNET=true
      shift
      ;;
    --setup-payments)
      SETUP_PAYMENTS=true
      shift
      ;;
    --agent-card)
      AGENT_CARD_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: PRIVATE_KEY=0x... $0 [--mainnet] [--setup-payments] [--agent-card path]"
      exit 1
      ;;
  esac
done

# Resolve agent card path (project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_CARD_PATH="$PROJECT_ROOT/$AGENT_CARD_FILE"

# Check PRIVATE_KEY
if [[ -z "$PRIVATE_KEY" ]]; then
  echo "Error: PRIVATE_KEY environment variable is required"
  echo "Usage: PRIVATE_KEY=0x... $0 [--mainnet] [--setup-payments]"
  exit 1
fi

# Check prerequisites
for cmd in filecoin-pin cast jq; do
  if ! command -v $cmd &>/dev/null; then
    echo "Error: $cmd is required but not installed"
    echo "  filecoin-pin: npm install -g filecoin-pin"
    echo "  cast: curl -L https://foundry.paradigm.xyz | bash && foundryup"
    echo "  jq: brew install jq"
    exit 1
  fi
done

# Select network
if $MAINNET; then
  NETWORK="mainnet"
  IDENTITY_REGISTRY="$IDENTITY_REGISTRY_MAINNET"
  RPC_URL="$BASE_MAINNET_RPC"
  FILECOIN_FLAGS="--mainnet"
else
  NETWORK="Base Sepolia (testnet)"
  IDENTITY_REGISTRY="$IDENTITY_REGISTRY_SEPOLIA"
  RPC_URL="$BASE_SEPOLIA_RPC"
  FILECOIN_FLAGS=""
fi

echo "=============================================="
echo "  ERC-8004 Agent Registration"
echo "  Network: $NETWORK"
echo "  Agent card: $AGENT_CARD_PATH"
echo "=============================================="
echo ""

# Step 1: Validate agent card
if [[ ! -f "$AGENT_CARD_PATH" ]]; then
  echo "Error: Agent card not found at $AGENT_CARD_PATH"
  exit 1
fi

echo "[1/4] Validating agent card..."
if ! jq . "$AGENT_CARD_PATH" >/dev/null 2>&1; then
  echo "Error: Invalid JSON in agent card"
  exit 1
fi
echo "      ✓ Valid JSON"
echo ""

# Step 2: Setup payments (optional)
if $SETUP_PAYMENTS; then
  echo "[2/4] Setting up Filecoin Pin payments..."
  filecoin-pin payments setup --auto $FILECOIN_FLAGS
  echo ""
fi

# Step 3: Upload to Filecoin Pin
echo "[3/4] Uploading to Filecoin Pin..."
UPLOAD_OUTPUT=$(filecoin-pin add --auto-fund $FILECOIN_FLAGS "$AGENT_CARD_PATH" 2>&1) || true

# Parse Root CID from output (IPFS CIDv1: bafybei + 52 base32 chars = 59 total)
ROOT_CID=$(echo "$UPLOAD_OUTPUT" | grep -E "Root CID:|ipfsRootCID:" | head -1 | grep -oE "bafybei[a-zA-Z0-9]{52}" | head -1)

if [[ -z "$ROOT_CID" ]]; then
  ROOT_CID=$(echo "$UPLOAD_OUTPUT" | grep -oE "bafybei[a-zA-Z0-9]{52}" | head -1)
fi

if [[ -z "$ROOT_CID" ]]; then
  echo "Error: Could not parse Root CID from filecoin-pin output"
  echo "Output:"
  echo "$UPLOAD_OUTPUT"
  exit 1
fi

TOKEN_URI="ipfs://${ROOT_CID}/$(basename "$AGENT_CARD_FILE")"
echo "      ✓ Uploaded"
echo "      Root CID: $ROOT_CID"
echo "      Token URI: $TOKEN_URI"
echo ""

# Step 4: Register on-chain
echo "[4/4] Registering on ERC-8004 Identity Registry..."
echo "      Registry: $IDENTITY_REGISTRY"

TX_OUTPUT=$(cast send "$IDENTITY_REGISTRY" "register(string)" "$TOKEN_URI" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" 2>&1) || true

# Extract transaction hash (cast outputs "transactionHash 0x...")
TX_HASH=$(echo "$TX_OUTPUT" | grep -oE "0x[a-fA-F0-9]{64}" | head -1)

if [[ -z "$TX_HASH" ]]; then
  echo "Error: Registration failed"
  echo "$TX_OUTPUT"
  exit 1
fi

echo "      ✓ Transaction: $TX_HASH"
echo ""

# Extract Agent ID from Transfer event
echo "Extracting Agent ID..."
AGENT_ID=$(cast receipt "$TX_HASH" --rpc-url "$RPC_URL" --json 2>/dev/null \
  | jq -r '.logs[] | select(.topics[0] == "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") | .topics[3]' \
  | head -1) || true

if [[ -n "$AGENT_ID" ]]; then
  AGENT_ID_DEC=$(cast --to-dec "$AGENT_ID" 2>/dev/null || echo "$AGENT_ID")
  echo "      Agent ID: $AGENT_ID_DEC"
  echo ""
fi

# Success summary
BASESCAN_BASE=$($MAINNET && echo "https://basescan.org" || echo "https://sepolia.basescan.org")
echo "=============================================="
echo "  ✓ Registration complete!"
echo "=============================================="
echo ""
echo "  Token URI:  $TOKEN_URI"
echo "  Tx Hash:    $TX_HASH"
[[ -n "$AGENT_ID_DEC" ]] && echo "  Agent ID:   $AGENT_ID_DEC"
echo ""
echo "  Explorer:   $BASESCAN_BASE/tx/$TX_HASH"
if [[ -n "$AGENT_ID_DEC" ]]; then
  echo "  NFT:        $BASESCAN_BASE/nft/$IDENTITY_REGISTRY/$AGENT_ID_DEC"
fi
echo ""
CHAIN_ID=$($MAINNET && echo "8453" || echo "84532")
echo "  Add to .env (optional):"
echo "  ERC8004_AGENT_ID=$AGENT_ID_DEC"
echo "  ERC8004_AGENT_REGISTRY=eip155:$CHAIN_ID:$IDENTITY_REGISTRY"
echo ""
