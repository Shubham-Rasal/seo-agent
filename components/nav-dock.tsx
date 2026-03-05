'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LogIn, FileText } from 'lucide-react';
import { ReactNode, useState, useEffect } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { useIsSignedIn, useCurrentUser } from '@coinbase/cdp-hooks';
import { SignInModal } from '@coinbase/cdp-react';
import { NavWalletButton } from './NavWalletButton';

interface NavDockProps {
  rightContent?: ReactNode;
}

export function NavDock({ rightContent }: NavDockProps = {}) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const { isSignedIn } = useIsSignedIn();
  const { currentUser } = useCurrentUser();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  // Mobile classes change based on scroll state
  const linkClass = isScrolled
    ? 'px-3 py-2 sm:px-3 sm:py-1.5'
    : 'px-4 py-3 sm:px-3 sm:py-1.5';
  const walletLinkClass = isScrolled
    ? 'px-3 py-2 sm:px-4 sm:py-1.5'
    : 'px-4 py-3 sm:px-4 sm:py-1.5';
  const iconClass = isScrolled
    ? 'h-5 w-5 sm:h-4 sm:w-4'
    : 'h-6 w-6 sm:h-4 sm:w-4';
  const containerPadding = isScrolled
    ? 'p-1 sm:p-1'
    : 'p-1.5 sm:p-1';

  const navItems = [
    { path: '/', icon: Home, label: 'Home', isActive: isActive('/') && !pathname.startsWith('/report') },
    ...(isSignedIn ? [{ path: '/report', icon: FileText, label: 'Report', isActive: pathname.startsWith('/report') }] : []),
  ];

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-200 ${isScrolled ? 'py-0' : ''}`} style={{ backgroundColor: 'transparent', pointerEvents: 'none' }}>
        <div className={`container mx-auto px-4 transition-all duration-200 ${isScrolled ? 'py-2 sm:py-3' : 'py-3'}`}>
          <div className="flex items-center justify-end" style={{ pointerEvents: 'auto' }}>
          {/* Navigation Dock + Optional Right Content */}
          <div className="flex items-center gap-3">
            <nav className="flex items-center">
              <LayoutGroup id="nav-dock">
                <div className={`relative flex items-center gap-1 rounded-full border transition-all duration-200 ${containerPadding}`} style={{ backgroundColor: 'rgba(42, 42, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        className={`relative z-10 inline-flex items-center justify-center gap-1.5 ${linkClass} rounded-full text-sm font-medium transition-colors duration-200 ${item.isActive
                          ? 'text-white'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                          }`}
                      >
                        {item.isActive && (
                          <motion.div
                            layoutId="nav-indicator"
                            className="absolute inset-0 rounded-full bg-gradient-to-b from-[#555555] to-[#333333] shadow-[0_2px_8px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.1)] -z-10"
                            initial={false}
                            transition={{
                              type: 'spring',
                              stiffness: 400,
                              damping: 30,
                            }}
                          />
                        )}
                        <Icon className={`${iconClass} transition-all duration-200`} />
                        <span className="hidden sm:inline">{item.label}</span>
                      </Link>
                    );
                  })}
                  {/* Wallet / Sign In */}
                  {isSignedIn ? (
                    <NavWalletButton
                      className={`relative z-10 inline-flex items-center justify-center gap-1.5 ${walletLinkClass} rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 transition-all`}
                      iconClassName={`${iconClass} transition-all duration-200`}
                    />
                  ) : (
                    <SignInModal>
                      <button
                        className={`relative z-10 inline-flex items-center justify-center gap-1.5 ${walletLinkClass} rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 transition-all`}
                      >
                        <LogIn className={`${iconClass} transition-all duration-200`} />
                        <span className="hidden sm:inline">Sign In</span>
                      </button>
                    </SignInModal>
                  )}
                </div>
              </LayoutGroup>
            </nav>
            {rightContent}
          </div>
          </div>
        </div>
      </header>
    </>
  );
}
