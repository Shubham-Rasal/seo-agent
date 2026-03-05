'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import { useIsSignedIn } from '@coinbase/cdp-hooks';
import { getCurrentUser, toViemAccount } from '@coinbase/cdp-core';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { COST_CONFIG } from '@/lib/config';
import { validateUrl, normalizeUrl } from '@/lib/validation';
import { AsciiBackground } from '@/components/AsciiBackground';


export default function Home() {
  const [url, setUrl] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [paymentFetch, setPaymentFetch] = useState<typeof fetch | null>(null);
  const authButtonRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { isSignedIn } = useIsSignedIn();

  // Setup wrapped fetch with payment capability when user signs in
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

        console.log('[Setup] Smart Wallet found:', user.evmSmartAccounts[0]);

        const viemAccount = await toViemAccount(user.evmSmartAccounts[0]);
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http('https://sepolia.base.org'),
        });
        const signer = toClientEvmSigner(viemAccount, publicClient);

        console.log('[Setup] Setting up x402 v2 client for Base Sepolia (eip155:84532)');

        const client = new x402Client()
          .register('eip155:84532', new ExactEvmScheme(signer));

        const wrapped = wrapFetchWithPayment(fetch, client);

        setPaymentFetch(() => wrapped);
        console.log('[Setup] ✓ x402 v2 payment fetch ready');
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
      // Get wallet address
      const user = await getCurrentUser();
      const walletAddress = user?.evmSmartAccounts?.[0] ?
        (await toViemAccount(user.evmSmartAccounts[0])).address :
        'unknown';

      // Normalize the URL (add https:// if missing)
      const normalizedUrl = normalizeUrl(url);

      console.log('[SEO Analysis] Starting analysis for:', normalizedUrl);
      console.log('[Payment] Using x402-wrapped fetch for payment handling');

      const response = await paymentFetch('/api/workflows/seo-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: normalizedUrl,
          userId: walletAddress,
          targetKeyword: keyword.trim(),
        }),
      });

      console.log('[Workflow] Response status:', response.status);

      if (response.status === 402) {
        console.warn('[Payment] Payment required (402)');

        // Parse 402 response to check for insufficient funds
        try {
          const data = await response.json();
          if (data.invalidReason === 'insufficient_funds') {
            throw new Error(`Insufficient USDC balance. You need at least $${COST_CONFIG.seoAnalysis} USDC on Base Sepolia. Please add funds and try again.`);
          } else {
            throw new Error(`Payment failed. Please ensure you have sufficient USDC balance ($${COST_CONFIG.seoAnalysis}) on Base Sepolia.`);
          }
        } catch (parseError) {
          // If we can't parse the response, show generic payment error
          if (parseError instanceof Error && parseError.message.includes('USDC')) {
            throw parseError; // Re-throw our custom error
          }
          throw new Error(`Payment failed. Please ensure you have sufficient USDC balance ($${COST_CONFIG.seoAnalysis}) on Base Sepolia.`);
        }
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start analysis');
      }

      const { runId } = await response.json();
      console.log('[Workflow] ✓ Analysis started:', runId);

      router.push(`/report/${runId}`);

    } catch (error) {
      console.error('[Client] Failed to start analysis:', error);

      let errorMessage = 'An unknown error occurred';
      if (error instanceof Error) {
        if (error.message.includes('402') || error.message.includes('Payment')) {
          errorMessage = `Payment failed. Please ensure you have sufficient USDC balance ($${COST_CONFIG.seoAnalysis}) on Base Sepolia.`;
        } else if (error.message.includes('rejected')) {
          errorMessage = 'Payment was rejected by your wallet';
        } else if (error.message.includes('Insufficient funds')) {
          errorMessage = `Insufficient USDC balance. You need at least $${COST_CONFIG.seoAnalysis} USDC on Base Sepolia.`;
        } else {
          errorMessage = error.message;
        }
      }

      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center" style={{ backgroundColor: '#212121', minHeight: '100vh', paddingBottom: '80px' }}>
      <AsciiBackground />
      <main className="w-full">
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-8 md:px-6 w-full pt-16 md:pt-0">
          <div className="text-center mb-6 md:mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 md:mb-4" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
              <Sparkles className="w-4 h-4" style={{ color: '#888888' }} />
              <span className="text-sm font-medium" style={{ color: '#CCCCCC' }}>AI-Powered SEO Analysis</span>
            </div>

            <h1 className="text-4xl md:text-7xl font-bold mb-3 md:mb-4 leading-tight px-2" style={{ color: '#FFFFFF' }}>
              Find Your SEO
              <br />
              <span style={{ color: '#888888' }}>Gaps in Minutes</span>
            </h1>

            <p className="text-sm md:text-2xl mb-6 md:mb-3 max-w-2xl mx-auto leading-relaxed px-4 md:px-0" style={{ color: '#CCCCCC' }}>
              Compare your site against top competitors and get actionable insights to improve your search rankings
            </p>
          </div>

          {/* Main CTA Form */}
          <div className="max-w-2xl mx-auto px-4 md:px-0">
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="relative">
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
                  className="w-full px-4 md:px-6 py-4 md:py-5 text-base md:text-lg rounded-xl border-2 transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: '#1A1A1A',
                    borderColor: focused ? '#444444' : (error ? '#EF4444' : '#2A2A2A'),
                    color: '#FFFFFF',
                  }}
                />
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Target keyword (e.g., graphic design)"
                  disabled={loading}
                  className="w-full px-4 md:px-6 py-4 md:py-5 text-base md:text-lg rounded-xl border-2 transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: '#1A1A1A',
                    borderColor: '#2A2A2A',
                    color: '#FFFFFF',
                  }}
                />
              </div>

              {error && (
                <p className="text-sm flex items-center gap-2 px-2" style={{ color: '#EF4444' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !url.trim() || !keyword.trim()}
                className="w-full py-4 md:py-5 px-6 rounded-xl font-semibold text-base md:text-lg transition-all flex items-center justify-center gap-3 group disabled:cursor-not-allowed relative overflow-hidden mt-6 md:mt-8"
                style={{
                  backgroundColor: (loading || !url.trim() || !keyword.trim()) ? '#CCCCCC' : '#FFFFFF',
                  color: '#000000',
                }}
                onMouseEnter={(e) => {
                  if (!loading && url.trim() && keyword.trim()) {
                    e.currentTarget.style.backgroundColor = '#F5F5F5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading && url.trim() && keyword.trim()) {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }
                }}
              >
                {loading ? (
                  <span className="text-base md:text-lg font-semibold" style={{ color: '#000000' }}>
                    Analyzing your site...
                  </span>
                ) : (
                  <>
                    <span>Start Analysis</span>
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <p className="text-center text-xs md:text-sm px-2" style={{ color: '#999999' }}>
                Powered by Hyperbrowser • ${COST_CONFIG.seoAnalysis} USDC per report
              </p>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
