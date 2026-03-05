'use client';

import { useCurrentUser, useIsSignedIn, useSignOut } from '@coinbase/cdp-hooks';
import { RefreshCw, Wallet, Copy, Check, ChevronDown, LogOut } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';

const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_DECIMALS = 6;

interface WalletDropdownProps {
  className?: string;
  iconClassName?: string;
  balance?: number | null;
}

export function WalletDropdown({ className, iconClassName, balance: externalBalance }: WalletDropdownProps = {}) {
  const { isSignedIn } = useIsSignedIn();
  const { currentUser } = useCurrentUser();
  const { signOut } = useSignOut();

  // Get Smart Wallet (ERC-4337) - this is the address that makes payments
  const evmAddress = currentUser?.evmSmartAccounts?.[0];
  const [balance, setBalance] = useState<number | null>(externalBalance ?? null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Update balance when external balance changes
  useEffect(() => {
    if (externalBalance !== undefined) {
      setBalance(externalBalance);
    }
  }, [externalBalance]);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    if (isSignedIn && evmAddress) {
      fetchBalance();
    }
  }, [isSignedIn, evmAddress]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const dropdownEl = dropdownRef.current;
      if (dropdownEl && !dropdownEl.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside as any);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside as any);
      };
    }
  }, [isOpen]);

  const fetchBalance = async () => {
    if (!evmAddress) return;

    setLoading(true);
    try {
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });

      const balanceResult = await client.readContract({
        address: USDC_BASE_SEPOLIA,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
          },
        ],
        functionName: 'balanceOf',
        args: [evmAddress as `0x${string}`],
      });

      const formattedBalance = parseFloat(formatUnits(balanceResult, USDC_DECIMALS));
      setBalance(formattedBalance);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      setBalance(null);
    } finally {
      setLoading(false);
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleCopyAddress = async (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!evmAddress) return;

    try {
      await navigator.clipboard.writeText(evmAddress);
      setCopied(true);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const handleRefreshClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    fetchBalance();
  };

  const handleLogoutClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    signOut();
  };

  if (!isSignedIn || !evmAddress) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Wallet Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={className || "inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 text-sm font-medium rounded-xl hover:bg-slate-50 transition-all shadow-sm shadow-black/5 border border-slate-200"}
      >
        <Wallet className={iconClassName || "h-4 w-4"} />
        <span className="hidden sm:inline font-mono text-xs whitespace-nowrap">
          {balance !== null ? `$${balance.toFixed(2)}` : '$0.00'}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''} hidden sm:inline`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-lg shadow-black/10 border border-slate-200 overflow-hidden z-50"
        >
          <div className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-100">
                  <Wallet className="w-5 h-5 text-slate-900" />
                </div>
                <span className="text-sm font-semibold text-slate-900">Wallet</span>
              </div>
              <button
                onClick={handleRefreshClick}
                disabled={loading}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                aria-label="Refresh balance"
              >
                <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Balance Section */}
            <div className="space-y-1.5">
              <span className="text-xs text-slate-500 font-medium">Balance</span>
              <div className="p-3 rounded-xl bg-slate-50">
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-slate-900">
                    {balance !== null ? (
                      `$${balance.toFixed(2)}`
                    ) : (
                      <span className="text-sm text-slate-400">Loading...</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500 mt-0.5">USDC on Base Sepolia</span>
                </div>
              </div>
            </div>

            {/* Address Section */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Address</span>
                {copied && (
                  <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <Check className="w-3 h-3" />
                    <span>Copied!</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black/10 active:scale-[0.98]"
                title="Click to copy full address"
              >
                <span className="font-mono text-xs text-slate-900 truncate">
                  {truncateAddress(evmAddress)}
                </span>
                {copied ? (
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
              </button>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogoutClick}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors active:scale-[0.98]"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
