'use client';

import { useCurrentUser, useIsSignedIn } from '@coinbase/cdp-hooks';
import { Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { WalletDropdown } from './WalletDropdown';

const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_DECIMALS = 6;

interface NavWalletButtonProps {
  className?: string;
  iconClassName?: string;
}

export function NavWalletButton({ className, iconClassName }: NavWalletButtonProps) {
  const { isSignedIn } = useIsSignedIn();
  const { currentUser } = useCurrentUser();
  const evmAddress = currentUser?.evmSmartAccounts?.[0];
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (isSignedIn && evmAddress) {
      fetchBalance();
    }
  }, [isSignedIn, evmAddress]);

  const fetchBalance = async () => {
    if (!evmAddress) return;

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
    }
  };

  if (!isSignedIn || !evmAddress) {
    return null;
  }

  return (
    <WalletDropdown
      className={className}
      iconClassName={iconClassName}
      balance={balance}
    />
  );
}
