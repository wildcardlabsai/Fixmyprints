import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Search } from 'lucide-react';
import type { BedLevelingCategory } from '../types/domain.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useWorkshop } from '../context/WorkshopContext.tsx';
import { CommandSearchModal } from './CommandSearchModal.tsx';

export function formatBedLevelingLabel(category: BedLevelingCategory): string {
  switch (category) {
    case 'MANUAL_SCREWS_WHEELS':
      return 'Manual 4-Point Wheels';
    case 'AUTO_PROBE_MESH':
      return 'Auto Mesh Probe (Manual Z-Offset)';
    case 'AUTO_LOAD_CELL_NOZZLE':
      return 'Auto Load-Cell / Nozzle Contact';
    case 'STRAIN_GAUGE_INTEGRATED':
      return 'Integrated Strain-Gauge Auto';
    case 'MANUFACTURER_AUTO_SYSTEM':
      return 'Multi-Sensor Auto Calibration';
    case 'HYBRID_MANUAL_AND_AUTO':
      return 'Hybrid Manual Wheels + Auto Mesh';
    case 'FIXED_MECHANICAL_BED':
      return 'Fixed / Mechanically Constrained';
    case 'NOT_APPLICABLE_RESIN':
      return 'MSLA Resin Platform';
    default:
      return 'Unverified Configuration';
  }
}

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const { user, accountSessions, guestBookmarks, openAuthModal } = useAuth();
  const { workshopPrinters, openWorkshopModal } = useWorkshop();
  const savedCount = user ? accountSessions.length : guestBookmarks.length;

  useEffect(() => {
    function handleGlobalShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, []);

  const navItems = [
    { label: 'Diagnose', path: '/diagnose' },
    { label: 'Printers', path: '/printers' },
    { label: 'Repair Guides', path: '/guides' },
    { label: 'Materials', path: '/materials' },
    { label: 'Reference & Tools', path: '/reference' },
  ];

  return (
    <div className="min-h-screen flex flex-col text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 px-4 sm:px-6 lg:px-8 h-16">
          {/* Zone 1: Official FixMyPrint Logo */}
          <Link
            to="/"
            aria-label="FixMyPrint Home"
            className="inline-flex items-center shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
          >
            <img
              src="/assets/aistudio/IMG_5414_595e4705.png"
              alt="FixMyPrint"
              width={2093}
              height={384}
              className="h-7 sm:h-8 w-auto object-contain select-none"
            />
          </Link>

          {/* Zone 2: 5 concise single-line text nav links */}
          <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
            {navItems.map((item) => {
              const active = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    active
                      ? 'text-blue-600 border-blue-600 font-semibold'
                      : 'border-transparent hover:text-slate-950 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Zone 3: Quick Search (Cmd+K) + Workshop/Auth + Primary CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              aria-label="Quick search (Command K)"
              className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-[#f6f9fc] border border-slate-200 rounded-lg hover:border-slate-300 hover:text-slate-950 transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden xl:inline">Search</span>
              <kbd className="hidden sm:inline font-mono text-[11px] text-slate-400">⌘K</kbd>
            </button>

            <button
              type="button"
              onClick={openWorkshopModal}
              className="hidden md:inline-block text-sm font-medium text-slate-600 hover:text-slate-950 whitespace-nowrap transition-colors tabular-nums"
            >
              Workshop{workshopPrinters.length > 0 ? ` (${workshopPrinters.length})` : ''}
            </button>

            <button
              type="button"
              onClick={() => openAuthModal(user || savedCount > 0 ? 'SESSIONS' : 'LOGIN')}
              className="hidden sm:inline-block text-sm font-medium text-slate-600 hover:text-slate-950 whitespace-nowrap transition-colors tabular-nums"
            >
              {user
                ? `${user.displayName}${savedCount > 0 ? ` (${savedCount})` : ''}`
                : savedCount > 0
                ? `Saved (${savedCount})`
                : 'Sign in'}
            </button>

            <Link
              to="/diagnose"
              className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Diagnose a Problem
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
              className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Responsive Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openWorkshopModal();
                }}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                My Workshop ({workshopPrinters.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuthModal(user || savedCount > 0 ? 'SESSIONS' : 'LOGIN');
                }}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {user ? `Account & Saved Sessions (${savedCount})` : 'Sign in / Saved Sessions'}
              </button>
              <Link
                to="/diagnose"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-center px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Diagnose a Problem
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-200 bg-white mt-16 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-sm text-slate-600">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/" aria-label="FixMyPrint Home" className="inline-flex items-center">
                <img
                  src="/assets/aistudio/IMG_5414_595e4705.png"
                  alt="FixMyPrint"
                  width={2093}
                  height={384}
                  loading="lazy"
                  className="h-6 w-auto object-contain select-none"
                />
              </Link>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="font-semibold text-slate-800">Faster fixes. Better prints.</span>
            </div>
            <p className="text-xs text-slate-500">
              Model-aware diagnostics, source-backed specifications, and safe repair workflows for FDM and MSLA resin 3D printers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-slate-600">
            <Link to="/printers" className="hover:text-slate-950 whitespace-nowrap">
              Printer Directory
            </Link>
            <Link to="/guides" className="hover:text-slate-950 whitespace-nowrap">
              Repair Guides
            </Link>
            <Link to="/materials" className="hover:text-slate-950 whitespace-nowrap">
              Materials
            </Link>
            <Link to="/reference" className="hover:text-slate-950 whitespace-nowrap">
              Error Codes
            </Link>
            <Link to="/reference?tab=maintenance" className="hover:text-slate-950 whitespace-nowrap">
              Maintenance
            </Link>
            <Link to="/reference?tab=calculators" className="hover:text-slate-950 whitespace-nowrap">
              Calculators
            </Link>
            <Link to="/admin" className="text-slate-400 hover:text-slate-700 whitespace-nowrap">
              Maintainer Console
            </Link>
          </div>
        </div>
      </footer>

      <CommandSearchModal open={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
    </div>
  );
};

