// x402 v2 Payment Verification for Next.js API Routes
// Uses CDP facilitator via @coinbase/x402 v2

import { HTTPFacilitatorClient } from '@x402/core/server';
import { facilitator } from '@coinbase/x402';
import type { PaymentPayload, PaymentRequired, SettleResponse } from '@x402/core/types';
import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  decodePaymentSignatureHeader,
} from '@x402/core/http';

const x402Version = 2;

// Create CDP facilitator client wrapper
const facilitatorClient = new HTTPFacilitatorClient(facilitator);

console.log('[x402] Using CDP facilitator (v2)');

// USDC contract addresses
const USDC_BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

//Network


/**
 * Creates payment requirements for an x402 endpoint
 */
export function createPaymentRequirements(
  price: string, // e.g. "$0.50" or "0.50"
  network: 'base' | 'base-sepolia' | 'eip155:8453' | 'eip155:84532',
  resourceUrl: string,
  description: string
): PaymentRequired {
  // Convert network to CAIP-2 format (v2 requirement)
  const caip2Network =
    network === 'base'
      ? 'eip155:8453'
      : network === 'base-sepolia'
      ? 'eip155:84532'
      : network;

  // Get receiving wallet address from env
  const payTo = process.env.USDC_RECEIVING_WALLET_ADDRESS as `0x${string}`;
  if (!payTo) {
    throw new Error('USDC_RECEIVING_WALLET_ADDRESS not configured');
  }

  // Parse price string to USDC amount (6 decimals)
  const priceNum = parseFloat(price.replace('$', ''));
  const usdcAmount = Math.floor(priceNum * 1_000_000).toString(); // USDC has 6 decimals

  // Select USDC contract based on network
  const usdcAsset =
    caip2Network === 'eip155:8453' ? USDC_BASE_MAINNET : USDC_BASE_SEPOLIA;

  // EIP-712 domain parameters for USDC (required for EIP-3009 signatures)
  // Note: ExactEvmScheme expects name/version directly in 'extra', not nested
  return {
    x402Version,
    error: 'Payment required',
    resource: {
      url: resourceUrl,
      description,
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network: caip2Network,
        asset: usdcAsset,
        amount: usdcAmount,
        payTo,
        maxTimeoutSeconds: 300,
        extra: {
          name: 'USD Coin',      // EIP-712 domain name
          version: '2',           // EIP-712 domain version
        },
      },
    ],
  };
}

/**
 * Verifies payment from request headers
 */
export async function verifyPayment(
  paymentSignatureHeader: string | null,
  paymentRequirements: PaymentRequired
): Promise<{
  isValid: boolean;
  payer?: string;
  error?: string;
}> {
  if (!paymentSignatureHeader) {
    return { isValid: false, error: 'No payment signature provided' };
  }

  try {
    // Decode payment payload
    const paymentPayload: PaymentPayload = decodePaymentSignatureHeader(
      paymentSignatureHeader
    );

    // Get the first payment requirements (we only have one)
    const paymentReqs = paymentRequirements.accepts[0];

    // Verify with facilitator
    const result = await facilitatorClient.verify(paymentPayload, paymentReqs);

    if (result.isValid) {
      return {
        isValid: true,
        payer: result.payer,
      };
    } else {
      return {
        isValid: false,
        error: result.invalidReason || 'Payment verification failed',
      };
    }
  } catch (error) {
    console.error('[x402] Payment verification error:', error instanceof Error ? error.message : 'Unknown error');
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/**
 * Settles payment on-chain (async, non-blocking)
 */
export async function settlePayment(
  paymentSignatureHeader: string,
  paymentRequirements: PaymentRequired
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  try {
    const paymentPayload: PaymentPayload = decodePaymentSignatureHeader(
      paymentSignatureHeader
    );

    // Get the first payment requirements (we only have one)
    const paymentReqs = paymentRequirements.accepts[0];

    // Settle with facilitator
    const result = await facilitatorClient.settle(paymentPayload, paymentReqs);

    if (result.success) {
      return {
        success: true,
        txHash: result.transaction,
      };
    } else {
      return {
        success: false,
        error: result.errorReason || 'Settlement failed',
      };
    }
  } catch (error) {
    console.error('[x402] Payment settlement error:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Settlement failed',
    };
  }
}

/**
 * Creates a 402 response with payment requirements
 */
export function create402Response(
  paymentRequirements: PaymentRequired,
  error?: string,
  payer?: string
) {
  // Return payment requirements directly for x402-fetch v0.7.0 compatibility
  // x402-fetch v0.7.0 expects { x402Version, accepts } at top level
  return paymentRequirements;
}

/**
 * Creates payment response header for settled payments
 * Only call this after settlement is complete with a transaction hash
 */
export function createPaymentResponseHeader(
  txHash: string,
  network: string,
  payer?: string
): string {
  const response: SettleResponse = {
    success: true,
    transaction: txHash,
    network: network as `${string}:${string}`,
    payer,
  };
  return encodePaymentResponseHeader(response);
}

/**
 * Encodes payment required as header value
 */
export function encodePaymentRequired(
  paymentRequirements: PaymentRequired
): string {
  return encodePaymentRequiredHeader(paymentRequirements);
}
