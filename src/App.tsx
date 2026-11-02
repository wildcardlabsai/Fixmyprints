/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AppDataProvider } from './context/AppDataContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { WorkshopProvider } from './context/WorkshopContext.tsx';
import { AppLayout } from './components/Layout.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { DiagnosePage } from './pages/DiagnosePage.tsx';
import { PrintersPage } from './pages/PrintersPage.tsx';
import { PrinterDetailPage } from './pages/PrinterDetailPage.tsx';
import { GuidesPage, GuideDetailPage } from './pages/GuidesPage.tsx';
import { MaterialsPage } from './pages/MaterialsPage.tsx';
import { ReferencePage } from './pages/ReferencePage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const NotFoundPage: React.FC = () => (
  <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">404</p>
    <h1 className="text-2xl font-bold text-slate-950">Page Not Found</h1>
    <p className="text-sm text-slate-600">
      The troubleshooting page or printer record you requested could not be found.
    </p>
    <div className="flex items-center justify-center gap-4 pt-2">
      <Link
        to="/diagnose"
        className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
      >
        Diagnose a Problem
      </Link>
      <Link
        to="/printers"
        className="px-4 py-2 text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
      >
        Browse Printers
      </Link>
    </div>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <AppDataProvider>
        <AuthProvider>
          <WorkshopProvider>
            <ScrollToTop />
            <AppLayout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/diagnose" element={<DiagnosePage />} />
                <Route path="/printers" element={<PrintersPage />} />
                <Route path="/printers/:slug" element={<PrinterDetailPage />} />
                <Route path="/guides" element={<GuidesPage />} />
                <Route path="/guides/:slug" element={<GuideDetailPage />} />
                <Route path="/materials" element={<MaterialsPage />} />
                <Route path="/reference" element={<ReferencePage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AppLayout>
          </WorkshopProvider>
        </AuthProvider>
      </AppDataProvider>
    </BrowserRouter>
  );
}

