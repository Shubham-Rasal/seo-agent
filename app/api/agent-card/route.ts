import { NextResponse } from 'next/server';
import { COST_CONFIG } from '@/lib/config';

/**
 * ERC-8004 Agent Card (AgentURI metadata)
 * Served at /.well-known/agent-card.json for agent discovery
 * See: https://best-practices.8004scan.io/docs/01-agent-metadata-standard
 */
export async function GET(request: Request) {
  // Use stable production URL — avoid temporary Vercel preview URLs (project-xyz.vercel.app)
  // Set NEXT_PUBLIC_URL or AGENT_BASE_URL in Vercel env to your production domain (e.g. https://seo-agent-phi.vercel.app)
  const explicit = process.env.NEXT_PUBLIC_URL || process.env.AGENT_BASE_URL;
  const explicitUrl = explicit?.startsWith("http") ? explicit : explicit ? `https://${explicit}` : null;
  const baseUrl =
    (explicitUrl && !explicitUrl.includes("localhost")) ? explicitUrl.replace(/\/$/, "")
    : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}`
    : new URL(request.url).origin;
  const receivingWallet = process.env.USDC_RECEIVING_WALLET_ADDRESS;
  const agentId = process.env.ERC8004_AGENT_ID;
  const agentRegistry = process.env.ERC8004_AGENT_REGISTRY;

  const agentCard = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'SEO Gap Analysis Agent',
    description:
      'AI-powered SEO analysis agent. Compares your site against top competitors for a target keyword, identifies gaps, and generates actionable recommendations. Payment-gated via x402 (USDC on Base Sepolia).',
    image: `${baseUrl}/logo.png`,
    active: true,
    x402Support: true,
    healthUrl: `${baseUrl}/api/health`,

    services: [
      {
        name: 'agent',
        version: '1.0.0',
        endpoint: `${baseUrl}/api/workflows/seo-analysis`,
        description: 'Run SEO gap analysis. POST with { url, userId, targetKeyword }. Returns runId. Poll /api/report/{runId}/status for progress.',
        protocol: 'http',
        type: 'x402',
        cost: COST_CONFIG.seoAnalysis.toString(),
        currency: 'USDC',
        network: 'eip155:84532',
        payment: {
          required: true,
          protocol: 'x402',
          network: 'eip155:84532',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          amount: COST_CONFIG.seoAnalysis.toString(),
          currency: 'USDC',
        },
        inputSchema: {
          type: 'object',
          required: ['url', 'userId', 'targetKeyword'],
          properties: {
            url: { type: 'string', description: 'Website URL to analyze, e.g. https://example.com' },
            userId: { type: 'string', description: 'Wallet address (CAIP-10 or 0x...)' },
            targetKeyword: { type: 'string', description: 'Target keyword for analysis' },
          },
        },
        requestSchema: {
          method: 'POST',
          contentType: 'application/json',
          body: {
            url: 'string (required) - Website URL to analyze, e.g. https://example.com',
            userId: 'string (required) - Wallet address (CAIP-10 or 0x...)',
            targetKeyword: 'string (required) - Target keyword for analysis',
          },
        },
        responseSchema: {
          success: 'boolean',
          runId: 'string - Use for status and report fetch',
          message: 'string',
        },
      },
      {
        name: 'status',
        version: '1.0.0',
        endpoint: `${baseUrl}/api/report/{runId}/status`,
        description: 'Poll workflow progress. GET returns { status, progress, completedSteps }.',
      },
      {
        name: 'report',
        version: '1.0.0',
        endpoint: `${baseUrl}/api/report/{runId}`,
        description: 'Fetch completed report. GET returns full report data when status is completed.',
      },
      ...(receivingWallet
        ? [
            {
              name: 'agentWallet',
              endpoint: `eip155:84532:${receivingWallet}`,
            },
          ]
        : []),
    ],

    ...(agentId && agentRegistry
      ? {
          registrations: [
            {
              agentId: parseInt(agentId, 10),
              agentRegistry,
            },
          ],
        }
      : {}),

    supportedTrust: ['reputation', 'crypto-economic'],
  };

  return NextResponse.json(agentCard, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
