'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles, Terminal, Copy, Check } from 'lucide-react';
import { useIsSignedIn } from '@coinbase/cdp-hooks';
import { getCurrentUser, toViemAccount } from '@coinbase/cdp-core';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { COST_CONFIG } from '@/lib/config';
import { validateUrl, normalizeUrl } from '@/lib/validation';
import { AsciiBackground } from '@/components/AsciiBackground';

const RUN_ID_PLACEHOLDER = 'seo_1772369564721_6dji43bb4';

const API_ENDPOINTS = [
  {
    step: 1,
    title: 'Start Analysis',
    method: 'POST',
    path: '/api/workflows/seo-analysis',
    description: 'Submit a URL and keyword. Requires x402 payment ($0.50 USDC on Base Sepolia). Returns runId for status polling.',
    curl: (base: string) =>
      `curl -X POST "${base}/api/workflows/seo-analysis" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","userId":"0xYourWalletAddress","targetKeyword":"web design agency"}'`,
    request: {
      url: 'https://example.com',
      userId: '0xYourWalletAddress',
      targetKeyword: 'web design agency',
    },
    response: {
      success: true,
      runId: RUN_ID_PLACEHOLDER,
      message: 'SEO analysis started',
    },
  },
  {
    step: 2,
    title: 'Check Status',
    method: 'GET',
    path: '/api/report/{runId}/status',
    description: 'Poll this endpoint to check workflow progress. When status is "completed", fetch the report.',
    curl: (base: string) =>
      `curl "${base}/api/report/${RUN_ID_PLACEHOLDER}/status"`,
    response: {
      status: 'analyzing',
      progress: 45,
      completedSteps: {
        userSiteData: true,
        discoveredKeywords: true,
        competitorData: false,
        patterns: false,
        gaps: false,
        recommendations: false,
        reportHtml: false,
      },
    },
  },
  {
    step: 3,
    title: 'Fetch Report',
    method: 'GET',
    path: '/api/report/{runId}',
    description: 'Retrieve the full SEO report when status is "completed".',
    curl: (base: string) =>
      `curl "${base}/api/report/${RUN_ID_PLACEHOLDER}"`,
    response: {
      runId: RUN_ID_PLACEHOLDER,
      status: 'completed',
      userUrl: 'https://example.com',
      score: 72,
      reportData: { /* ... */ },
      createdAt: '2026-03-01T12:00:00.000Z',
    },
  },
];

function CodeBlock({ children, copyable = true }: { children: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = async () => {
    if (!preRef.current) return;
    await navigator.clipboard.writeText(preRef.current.textContent || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre
        ref={preRef}
        className="overflow-x-auto rounded-lg p-4 text-sm font-mono"
        style={{ backgroundColor: '#0d1117', color: '#e6edf3', border: '1px solid #30363d' }}
      >
        {children}
      </pre>
      {copyable && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: '#21262d', color: '#8b949e' }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [paymentFetch, setPaymentFetch] = useState<typeof fetch | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const router = useRouter();
  const { isSignedIn } = useIsSignedIn();

  useEffect(() => {
    setBaseUrl(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  useEffect(() => {
    async function setupPaymentFetch() {
      if (!isSignedIn) {
        setPaymentFetch(null);
        return;
      }

      try {
        const user = await getCurrentUser();

        if (!user?.evmSmartAccounts?.[0]) {
          console.warn('[Setup] No Smart Wallet found. User may need to sign out and back in.');
          return;
        }

        const viemAccount = await toViemAccount(user.evmSmartAccounts[0]);
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http('https://sepolia.base.org'),
        });
        const signer = toClientEvmSigner(viemAccount, publicClient);

        const client = new x402Client()
          .register('eip155:84532', new ExactEvmScheme(signer));

        const wrapped = wrapFetchWithPayment(fetch, client);

        setPaymentFetch(() => wrapped);
      } catch (error) {
        console.error('[Setup] Failed to create payment fetch:', error);
      }
    }

    setupPaymentFetch();
  }, [isSignedIn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const urlError = validateUrl(url);
    if (urlError) {
      setError(urlError);
      return;
    }

    if (!keyword.trim()) {
      setError('Please enter a target keyword');
      return;
    }

    if (!isSignedIn) {
      setError('Please sign in to continue');
      setTimeout(() => {
        const authButton = document.querySelector('[data-testid="cdp-auth-button"]') as HTMLButtonElement;
        if (authButton) authButton.click();
      }, 100);
      return;
    }

    if (!paymentFetch) {
      setError('Payment system is initializing. Please wait a moment and try again.');
      return;
    }

    setLoading(true);

    try {
      const user = await getCurrentUser();
      const walletAddress = user?.evmSmartAccounts?.[0]
        ? (await toViemAccount(user.evmSmartAccounts[0])).address
        : 'unknown';

      const normalizedUrl = normalizeUrl(url);

      const response = await paymentFetch('/api/workflows/seo-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: normalizedUrl,
          userId: walletAddress,
          targetKeyword: keyword.trim(),
        }),
      });

      if (response.status === 402) {
        try {
          const data = await response.json();
          if (data.invalidReason === 'insufficient_funds') {
            throw new Error(`Insufficient USDC balance. You need at least $${COST_CONFIG.seoAnalysis} USDC on Base Sepolia.`);
          }
        } catch (parseError) {
          if (parseError instanceof Error && parseError.message.includes('USDC')) {
            throw parseError;
          }
        }
        throw new Error(`Payment failed. Ensure you have $${COST_CONFIG.seoAnalysis} USDC on Base Sepolia.`);
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start analysis');
      }

      const { runId } = await response.json();
      router.push(`/report/${runId}`);
    } catch (error) {
      let errorMessage = 'An unknown error occurred';
      if (error instanceof Error) {
        if (error.message.includes('402') || error.message.includes('Payment')) {
          errorMessage = `Payment failed. Ensure you have $${COST_CONFIG.seoAnalysis} USDC on Base Sepolia.`;
        } else if (error.message.includes('rejected')) {
          errorMessage = 'Payment was rejected by your wallet';
        } else {
          errorMessage = error.message;
        }
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ backgroundColor: '#212121', minHeight: '100vh', paddingBottom: '80px' }}>
      <AsciiBackground />
      <main className="w-full max-w-4xl mx-auto px-6 md:px-8 pt-12 md:pt-16">
        {/* Hero */}
        <section className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
            <Terminal className="w-4 h-4" style={{ color: '#888888' }} />
            <span className="text-sm font-medium" style={{ color: '#CCCCCC' }}>x402 Payment-Gated API</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold mb-4" style={{ color: '#FFFFFF' }}>
            SEO Gap Analysis
            <br />
            <span style={{ color: '#888888' }}>API</span>
          </h1>

          <p className="text-lg md:text-xl max-w-2xl mx-auto mb-6" style={{ color: '#CCCCCC' }}>
            AI-powered SEO analysis via HTTP. Pay $0.001 USDC per request with x402. Poll for status, fetch the report.
          </p>

          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <a
              href="/.well-known/agent-card.json"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg"
              style={{ backgroundColor: '#2A2A2A', color: '#CCCCCC', border: '1px solid #3A3A3A' }}
            >
              Agent Card
            </a>
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg"
              style={{ backgroundColor: '#2A2A2A', color: '#CCCCCC', border: '1px solid #3A3A3A' }}
            >
              Health Check
            </a>
          </div>
        </section>

        {/* API Reference */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2" style={{ color: '#FFFFFF' }}>
            <Terminal className="w-6 h-6" />
            API Endpoints
          </h2>

          <div className="space-y-10">
            {API_ENDPOINTS.map((ep) => (
              <div
                key={ep.step}
                className="rounded-xl p-6"
                style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: '#333', color: '#fff' }}
                  >
                    {ep.step}
                  </span>
                  <h3 className="text-lg font-semibold" style={{ color: '#FFFFFF' }}>
                    {ep.title}
                  </h3>
                  <span
                    className="px-2 py-0.5 rounded text-xs font-mono"
                    style={{
                      backgroundColor: ep.method === 'POST' ? '#238636' : '#1f6feb',
                      color: '#fff',
                    }}
                  >
                    {ep.method}
                  </span>
                </div>

                <p className="text-sm mb-4" style={{ color: '#8b949e' }}>
                  {ep.description}
                </p>

                <div className="mb-3">
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#6e7681' }}>
                    curl
                  </span>
                  <CodeBlock copyable>
                    {ep.curl(baseUrl || 'https://your-domain.com')}
                  </CodeBlock>
                </div>

                <div className="mb-3">
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#6e7681' }}>
                    Endpoint
                  </span>
                  <CodeBlock copyable>
                    {baseUrl || 'https://your-domain.com'}{ep.path}
                  </CodeBlock>
                </div>

                {ep.request && (
                  <div className="mb-3">
                    <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#6e7681' }}>
                      Request body (Step 1 only)
                    </span>
                    <CodeBlock copyable>
                      {JSON.stringify(ep.request, null, 2)}
                    </CodeBlock>
                  </div>
                )}

                <div>
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#6e7681' }}>
                    Response
                  </span>
                  <CodeBlock copyable>
                    {JSON.stringify(ep.response, null, 2)}
                  </CodeBlock>
                </div>

                {ep.step === 1 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs" style={{ color: '#6e7681' }}>
                      First request returns <strong>402 Payment Required</strong>. Use <strong>purl</strong> (curl + payments) for automatic handling:
                    </p>
                    <CodeBlock copyable>
                      {`# Install: brew install stripe/purl/purl
# Add wallet: purl wallet add
purl -X POST "${baseUrl || 'http://localhost:3000'}/api/workflows/seo-analysis" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","userId":"0xYourWallet","targetKeyword":"web design"}'`}
                    </CodeBlock>
                  </div>
                )}

                {ep.step === 2 && (
                  <p className="mt-3 text-xs" style={{ color: '#6e7681' }}>
                    Poll every 3–5 seconds. When <code className="px-1 rounded" style={{ backgroundColor: '#2d2d2d' }}>status</code> is <code className="px-1 rounded" style={{ backgroundColor: '#2d2d2d' }}>&quot;completed&quot;</code>, call the report endpoint.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Try it */}
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2" style={{ color: '#FFFFFF' }}>
            <Sparkles className="w-6 h-6" />
            Try it
          </h2>

          <div
            className="rounded-xl p-6"
            style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}
          >
            <p className="text-sm mb-4" style={{ color: '#8b949e' }}>
              Run an analysis from the browser. Sign in and pay with USDC on Base Sepolia.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError(null);
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="example.com"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-lg border-2 transition-all focus:outline-none disabled:opacity-50"
                  style={{
                    backgroundColor: '#0d1117',
                    borderColor: focused ? '#444' : error ? '#ef4444' : '#2A2A2A',
                    color: '#fff',
                  }}
                />
              </div>

              <div>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Target keyword (e.g., graphic design)"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-lg border-2 transition-all focus:outline-none disabled:opacity-50"
                  style={{
                    backgroundColor: '#0d1117',
                    borderColor: '#2A2A2A',
                    color: '#fff',
                  }}
                />
              </div>

              {error && (
                <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !url.trim() || !keyword.trim()}
                className="w-full py-3 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: loading || !url.trim() || !keyword.trim() ? '#444' : '#fff',
                  color: '#000',
                }}
              >
                {loading ? 'Starting...' : (
                  <>
                    Start Analysis
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <p className="text-center text-xs" style={{ color: '#6e7681' }}>
                ${COST_CONFIG.seoAnalysis} USDC per report • Base Sepolia
              </p>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
